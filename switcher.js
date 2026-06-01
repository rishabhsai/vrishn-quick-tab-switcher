const queryInput = document.querySelector("#query");
const listElement = document.querySelector("#list");
const params = new URLSearchParams(location.search);

const state = {
  activeTabId: null,
  accentColor: "#2f6fed",
  allTabs: [],
  filteredTabs: [],
  hasNavigated: false,
  ignoreHoverUntil: 0,
  lastPointerX: null,
  lastPointerY: null,
  mode: params.get("mode") === "search"
    ? "search"
    : "cycle",
  query: "",
  releaseToActivate: params.get("mode") !== "search",
  restoreLastSearch: false,
  selectedIndex: 0
};
const sourceTabId = Number(params.get("sourceTabId"));
const sourceWindowId = Number(params.get("sourceWindowId"));

const mockTabs = [
  {
    active: true,
    favIconUrl: "",
    id: 1,
    index: 0,
    pinned: false,
    title: "Vrishn / release notes",
    url: "https://github.com/rishabhsai/vrishn-quick-tab-switcher/releases",
    windowId: 1
  },
  {
    active: false,
    favIconUrl: "",
    id: 2,
    index: 1,
    pinned: false,
    title: "QuicKey | Jump between recent tabs",
    url: "https://fwextensions.github.io/QuicKey/",
    windowId: 1
  },
  {
    active: false,
    favIconUrl: "",
    id: 3,
    index: 2,
    pinned: true,
    title: "Chrome Extensions commands API",
    url: "https://developer.chrome.com/docs/extensions/reference/api/commands",
    windowId: 1
  }
];

function extensionAvailable() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
}

function sendMessage(message) {
  if (!extensionAvailable()) {
    if (message.type === "get-tabs") {
      return Promise.resolve({
        activeTabId: 1,
        settings: {accentColor: state.accentColor, restoreLastSearch: false},
        tabs: mockTabs
      });
    }
    return Promise.resolve({ok: true});
  }
  return chrome.runtime.sendMessage(message);
}

function isColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function applyAccentColor(value) {
  if (!isColor(value)) {
    return;
  }
  state.accentColor = value;
  document.documentElement.style.setProperty("--accent", value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function displayUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url || "";
  }
}

function firstLetter(title, url) {
  const source = title || displayUrl(url) || "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}

function queryTerms(query) {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isCycleMode() {
  return state.mode === "cycle" && state.query.trim() === "";
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  queryInput.placeholder = mode === "cycle"
    ? "Recent tabs"
    : "Search tabs by title or URL";
}

function applySavedQueryIfNeeded() {
  if (state.mode !== "search" || !state.restoreLastSearch) {
    return;
  }
  state.query = localStorage.getItem("lastSearchQuery") || "";
  queryInput.value = state.query;
}

function isBoundary(source, index) {
  if (index === 0) {
    return true;
  }
  const previous = source[index - 1];
  const current = source[index];
  return /[\s/:._#?&=-]/.test(previous) ||
    (previous && current && previous === previous.toLocaleLowerCase() &&
      current === current.toLocaleUpperCase());
}

function scoreTerm(source, term) {
  const lowerSource = source.toLocaleLowerCase();
  const exactIndex = lowerSource.indexOf(term);
  if (exactIndex !== -1) {
    return 900 - exactIndex * 2 + (isBoundary(source, exactIndex) ? 120 : 0);
  }

  let searchFrom = 0;
  let score = 0;
  let previousIndex = -1;
  for (const char of term) {
    const index = lowerSource.indexOf(char, searchFrom);
    if (index === -1) {
      return null;
    }
    score += 25;
    if (isBoundary(source, index)) {
      score += 20;
    }
    if (previousIndex + 1 === index) {
      score += 45;
    }
    score -= Math.max(0, index - searchFrom);
    previousIndex = index;
    searchFrom = index + 1;
  }
  return score;
}

function scoreTab(tab, terms, mruIndex) {
  if (terms.length === 0) {
    return 10000 - mruIndex;
  }

  const title = tab.title || "";
  const url = tab.url || "";
  let total = 0;

  for (const term of terms) {
    const titleScore = scoreTerm(title, term);
    const urlScore = scoreTerm(url, term);
    const best = Math.max(titleScore ?? -1, urlScore ?? -1);
    if (best < 0) {
      return null;
    }
    total += best;
  }

  return total + Math.max(0, 300 - mruIndex * 12);
}

function highlight(value, terms) {
  if (!terms.length) {
    return escapeHtml(value);
  }
  const lower = value.toLocaleLowerCase();
  let range = null;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1) {
      range = [index, index + term.length];
      break;
    }
  }
  if (!range) {
    return escapeHtml(value);
  }
  return `${escapeHtml(value.slice(0, range[0]))}<mark>${escapeHtml(value.slice(range[0], range[1]))}</mark>${escapeHtml(value.slice(range[1]))}`;
}

function filterTabs() {
  const terms = queryTerms(state.query);
  const ranked = [];

  state.allTabs.forEach((tab, index) => {
    const score = scoreTab(tab, terms, index);
    if (score !== null) {
      ranked.push({...tab, score, mruIndex: index});
    }
  });

  ranked.sort((a, b) => b.score - a.score || a.mruIndex - b.mruIndex);
  state.filteredTabs = ranked;

  if (state.query.trim() === "") {
    const previousTabIndex = state.filteredTabs.findIndex(
      (tab) => tab.id !== state.activeTabId
    );
    state.selectedIndex = previousTabIndex === -1 ? 0 : previousTabIndex;
  } else {
    state.selectedIndex = Math.min(
      state.selectedIndex,
      Math.max(0, state.filteredTabs.length - 1)
    );
  }
}

function renderIcon(tab) {
  if (tab.favIconUrl) {
    return `<img class="favicon" src="${escapeHtml(tab.favIconUrl)}" alt="">`;
  }
  return `<span class="fallback-icon">${escapeHtml(firstLetter(tab.title, tab.url))}</span>`;
}

function renderList() {
  if (!state.filteredTabs.length) {
    listElement.innerHTML = `<div class="empty">No matching tabs</div>`;
    return;
  }

  const terms = queryTerms(state.query);
  listElement.innerHTML = state.filteredTabs.map((tab, index) => {
    const selected = index === state.selectedIndex;
    const active = tab.id === state.activeTabId;
    const title = tab.title || "Untitled";
    const url = displayUrl(tab.url);
    return `
      <div class="tab-row ${active ? "active-tab" : ""}" role="option"
          aria-selected="${selected}" data-index="${index}">
        ${renderIcon(tab)}
        <span class="copy">
          <span class="title">${highlight(title, terms)}</span>
          <span class="url">${highlight(url, terms)}</span>
        </span>
        <span class="meta">
          ${tab.pinned ? `<span class="pin">Pinned</span>` : ""}
          <button class="close" data-close-index="${index}" title="Close tab" aria-label="Close tab">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="m7.1 5.7 4.9 4.9 4.9-4.9 1.4 1.4-4.9 4.9 4.9 4.9-1.4 1.4-4.9-4.9-4.9 4.9-1.4-1.4 4.9-4.9-4.9-4.9 1.4-1.4Z"/>
            </svg>
          </button>
        </span>
      </div>
    `;
  }).join("");

  listElement
    .querySelector(`[data-index="${state.selectedIndex}"]`)
    ?.scrollIntoView({block: "nearest"});
}

function moveSelection(delta) {
  if (!state.filteredTabs.length) {
    return;
  }
  state.hasNavigated = true;
  state.ignoreHoverUntil = Date.now() + 700;
  state.releaseToActivate = true;
  const count = state.filteredTabs.length;
  state.selectedIndex = (state.selectedIndex + delta + count) % count;
  renderList();
}

function isQKey(event) {
  return event.code === "KeyQ" ||
    ["q", "œ"].includes(event.key.toLocaleLowerCase());
}

function pageSelection(delta) {
  if (!state.filteredTabs.length) {
    return;
  }
  state.hasNavigated = true;
  state.ignoreHoverUntil = Date.now() + 700;
  state.selectedIndex = Math.min(
    Math.max(0, state.selectedIndex + delta),
    state.filteredTabs.length - 1
  );
  renderList();
}

async function activateSelected() {
  const selected = state.filteredTabs[state.selectedIndex];
  if (!selected) {
    return;
  }
  await sendMessage({type: "activate-tab", tabId: selected.id});
  window.close();
}

async function closeSelected() {
  const selected = state.filteredTabs[state.selectedIndex];
  if (!selected) {
    return;
  }
  await sendMessage({type: "close-tab", tabId: selected.id});
  state.allTabs = state.allTabs.filter((tab) => tab.id !== selected.id);
  filterTabs();
  renderList();
}

function closeOrClear() {
  if (state.query) {
    state.query = "";
    queryInput.value = "";
    filterTabs();
    renderList();
  } else {
    window.close();
  }
}

function handleKeyDown(event) {
  const key = event.key;
  const quickCycleKey = key.length === 1 && ["q", "w", "œ"].includes(key.toLocaleLowerCase());

  if (isCycleMode() && isQKey(event)) {
    event.preventDefault();
    moveSelection(event.shiftKey ? -1 : 1);
    return;
  }

  if ((event.altKey || event.ctrlKey || event.metaKey) && quickCycleKey) {
    event.preventDefault();
    moveSelection(event.shiftKey ? -1 : 1);
    return;
  }

  if (key === "ArrowDown" ||
      ((event.ctrlKey || event.metaKey) && ["j", "n"].includes(key.toLocaleLowerCase()))) {
    event.preventDefault();
    moveSelection(1);
  } else if (key === "ArrowUp" ||
      ((event.ctrlKey || event.metaKey) && ["k", "p"].includes(key.toLocaleLowerCase()))) {
    event.preventDefault();
    moveSelection(-1);
  } else if (key === "PageDown") {
    event.preventDefault();
    pageSelection(8);
  } else if (key === "PageUp") {
    event.preventDefault();
    pageSelection(-8);
  } else if (key === "Home") {
    event.preventDefault();
    state.hasNavigated = true;
    state.releaseToActivate = true;
    state.selectedIndex = 0;
    renderList();
  } else if (key === "End") {
    event.preventDefault();
    state.hasNavigated = true;
    state.releaseToActivate = true;
    state.selectedIndex = Math.max(0, state.filteredTabs.length - 1);
    renderList();
  } else if (key === "Enter") {
    event.preventDefault();
    activateSelected();
  } else if (key === "Escape") {
    event.preventDefault();
    closeOrClear();
  } else if (isCycleMode() && key.length === 1 && !event.altKey &&
      !event.ctrlKey && !event.metaKey) {
    setMode("search");
  }
}

function handleKeyUp(event) {
  if (!state.releaseToActivate || state.query.trim()) {
    return;
  }
  if (event.key === "Alt" || event.key === "Control" || event.key === "Meta") {
    activateSelected();
  }
}

async function loadTabs() {
  const response = await sendMessage({
    sourceTabId: Number.isInteger(sourceTabId) ? sourceTabId : null,
    sourceWindowId: Number.isInteger(sourceWindowId) ? sourceWindowId : null,
    type: "get-tabs"
  });
  state.activeTabId = response.activeTabId;
  state.allTabs = response.tabs || [];
  applyAccentColor(response.settings?.accentColor || state.accentColor);
  state.restoreLastSearch = Boolean(response.settings?.restoreLastSearch);
  applySavedQueryIfNeeded();
  filterTabs();
  renderList();
}

queryInput.addEventListener("input", () => {
  state.query = queryInput.value;
  if (state.restoreLastSearch) {
    localStorage.setItem("lastSearchQuery", state.query);
  }
  state.selectedIndex = 0;
  filterTabs();
  renderList();
});

window.addEventListener("keyup", handleKeyUp);

if (extensionAvailable()) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.target !== "switcher") {
      return;
    }
    if (message.type === "cycle-selection") {
      setMode("cycle");
      if (state.query) {
        state.query = "";
        queryInput.value = "";
        filterTabs();
      }
      moveSelection(message.direction === "up" ? -1 : 1);
    } else if (message.type === "enter-search-mode") {
      setMode("search");
      queryInput.focus();
    }
  });
}

window.addEventListener("keydown", handleKeyDown, true);

listElement.addEventListener("pointermove", (event) => {
  if (Date.now() < state.ignoreHoverUntil) {
    return;
  }
  if (state.lastPointerX === event.clientX &&
      state.lastPointerY === event.clientY) {
    return;
  }
  state.lastPointerX = event.clientX;
  state.lastPointerY = event.clientY;

  const row = event.target.closest("[data-index]");
  if (!row) {
    return;
  }
  const index = Number(row.dataset.index);
  if (Number.isInteger(index) && index !== state.selectedIndex) {
    state.selectedIndex = index;
    renderList();
  }
});

listElement.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-index]");
  if (closeButton) {
    event.preventDefault();
    event.stopPropagation();
    state.selectedIndex = Number(closeButton.dataset.closeIndex);
    closeSelected();
    return;
  }

  const row = event.target.closest("[data-index]");
  if (row) {
    state.selectedIndex = Number(row.dataset.index);
    activateSelected();
  }
});

setMode(state.mode);
queryInput.focus();
loadTabs();
