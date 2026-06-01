const MRU_KEY = "mru.entries.v1";
const SETTINGS_KEY = "settings.v1";
const MAX_MRU = 300;
const DEFAULT_SETTINGS = {
  height: 420,
  hidePinnedTabs: false,
  limitToCurrentWindow: false,
  restoreLastSearch: false,
  width: 560
};
const EXTENSION_ORIGIN = chrome.runtime.getURL("");

function now() {
  return Date.now();
}

async function getStoredMru() {
  const result = await chrome.storage.local.get({[MRU_KEY]: []});
  return Array.isArray(result[MRU_KEY]) ? result[MRU_KEY] : [];
}

async function getSettings() {
  const result = await chrome.storage.local.get({[SETTINGS_KEY]: DEFAULT_SETTINGS});
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_KEY] || {})
  };
}

async function saveSettings(settings) {
  const width = Math.min(900, Math.max(420, Number(settings.width) || DEFAULT_SETTINGS.width));
  const height = Math.min(720, Math.max(300, Number(settings.height) || DEFAULT_SETTINGS.height));
  const saved = {
    height,
    hidePinnedTabs: Boolean(settings.hidePinnedTabs),
    limitToCurrentWindow: Boolean(settings.limitToCurrentWindow),
    restoreLastSearch: Boolean(settings.restoreLastSearch),
    width
  };
  await chrome.storage.local.set({[SETTINGS_KEY]: saved});
  return saved;
}

async function setStoredMru(entries) {
  await chrome.storage.local.set({[MRU_KEY]: entries.slice(0, MAX_MRU)});
}

function normalizeTab(tab) {
  return {
    active: Boolean(tab.active),
    favIconUrl: tab.favIconUrl || "",
    highlighted: Boolean(tab.highlighted),
    id: tab.id,
    incognito: Boolean(tab.incognito),
    index: tab.index,
    lastAccessed: tab.lastAccessed || 0,
    pinned: Boolean(tab.pinned),
    title: tab.title || tab.pendingUrl || tab.url || "Untitled",
    url: tab.url || tab.pendingUrl || "",
    windowId: tab.windowId
  };
}

function isOwnExtensionTab(tab) {
  return Boolean(tab?.url?.startsWith(EXTENSION_ORIGIN));
}

async function rememberTab(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (isOwnExtensionTab(tab)) {
    return;
  }

  const normalized = normalizeTab(tab);
  const entries = await getStoredMru();
  const withoutCurrent = entries.filter((entry) => entry.id !== tabId);
  await setStoredMru([{...normalized, lastSeen: now()}, ...withoutCurrent]);
}

async function updateStoredTab(tabId) {
  const entries = await getStoredMru();
  const existingIndex = entries.findIndex((entry) => entry.id === tabId);
  if (existingIndex === -1) {
    return;
  }

  try {
    const rawTab = await chrome.tabs.get(tabId);
    if (isOwnExtensionTab(rawTab)) {
      await removeStoredTab(tabId);
      return;
    }
    const tab = normalizeTab(rawTab);
    entries[existingIndex] = {
      ...entries[existingIndex],
      ...tab,
      lastSeen: entries[existingIndex].lastSeen || now()
    };
    await setStoredMru(entries);
  } catch {
    await setStoredMru(entries.filter((entry) => entry.id !== tabId));
  }
}

async function removeStoredTab(tabId) {
  const entries = await getStoredMru();
  await setStoredMru(entries.filter((entry) => entry.id !== tabId));
}

async function buildTabList(sourceTabId = null, sourceWindowId = null) {
  const [tabs, entries, settings] = await Promise.all([
    chrome.tabs.query({}),
    getStoredMru(),
    getSettings()
  ]);
  const liveTabs = tabs
    .filter((tab) => !isOwnExtensionTab(tab))
    .filter((tab) => !settings.limitToCurrentWindow ||
      sourceWindowId === null || tab.windowId === sourceWindowId)
    .filter((tab) => !settings.hidePinnedTabs || !tab.pinned)
    .map(normalizeTab);
  const liveById = new Map(liveTabs.map((tab) => [tab.id, tab]));
  const seen = new Set();
  const ordered = [];

  for (const entry of entries) {
    const liveTab = liveById.get(entry.id);
    if (!liveTab || seen.has(liveTab.id)) {
      continue;
    }
    seen.add(liveTab.id);
    ordered.push({
      ...liveTab,
      lastSeen: entry.lastSeen || liveTab.lastAccessed || 0
    });
  }

  for (const tab of liveTabs) {
    if (!seen.has(tab.id)) {
      ordered.push({
        ...tab,
        lastSeen: tab.lastAccessed || 0
      });
    }
  }

  return {
    activeTabId: sourceTabId ?? liveTabs.find((tab) => tab.active)?.id ?? null,
    settings,
    tabs: ordered
  };
}

async function activateTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.windows.update(tab.windowId, {focused: true});
  await chrome.tabs.update(tab.id, {active: true});
  await rememberTab(tab.id);
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
  await removeStoredTab(tabId);
}

async function findSwitcherWindow() {
  const extensionUrl = chrome.runtime.getURL("switcher.html");
  const windows = await chrome.windows.getAll({populate: true});
  for (const browserWindow of windows) {
    const tab = browserWindow.tabs?.find((candidate) =>
      candidate.url?.startsWith(extensionUrl)
    );
    if (tab) {
      return {windowId: browserWindow.id, tabId: tab.id};
    }
  }
  return null;
}

function readSourceTabId(url) {
  try {
    const parsed = new URL(url);
    const sourceTabId = Number(parsed.searchParams.get("sourceTabId"));
    return Number.isInteger(sourceTabId) ? sourceTabId : null;
  } catch {
    return null;
  }
}

function readSourceWindowId(url) {
  try {
    const parsed = new URL(url);
    const sourceWindowId = Number(parsed.searchParams.get("sourceWindowId"));
    return Number.isInteger(sourceWindowId) ? sourceWindowId : null;
  } catch {
    return null;
  }
}

async function getLaunchContext(existing) {
  if (existing) {
    try {
      const tab = await chrome.tabs.get(existing.tabId);
      const sourceTabId = readSourceTabId(tab.url);
      const sourceWindowId = readSourceWindowId(tab.url);
      if (sourceTabId) {
        return {sourceTabId, sourceWindowId};
      }
    } catch {
      return {sourceTabId: null};
    }
  }

  const current = await chrome.windows.getLastFocused();
  const [sourceTab] = await chrome.tabs.query({
    active: true,
    windowId: current.id
  });
  return {
    current,
    sourceTabId: isOwnExtensionTab(sourceTab) ? null : sourceTab?.id ?? null,
    sourceWindowId: isOwnExtensionTab(sourceTab) ? null : sourceTab?.windowId ?? null
  };
}

async function sendSwitcherCommand(message) {
  try {
    await chrome.runtime.sendMessage({target: "switcher", ...message});
  } catch {
    // The popup may still be loading; the keyup handler will cover release.
  }
}

async function openSwitcher(mode = "cycle") {
  const settings = await getSettings();
  const existing = await findSwitcherWindow();
  const context = await getLaunchContext(existing);
  const switcherUrl = chrome.runtime.getURL(
    `switcher.html?mode=${encodeURIComponent(mode)}&sourceTabId=${context.sourceTabId ?? ""}&sourceWindowId=${context.sourceWindowId ?? ""}`
  );
  if (existing) {
    await chrome.windows.update(existing.windowId, {
      focused: true,
      height: settings.height,
      width: settings.width
    });
    if (mode === "cycle") {
      await sendSwitcherCommand({type: "cycle-selection", direction: "down"});
    } else {
      await sendSwitcherCommand({type: "enter-search-mode"});
    }
    return;
  }

  const current = context.current ?? await chrome.windows.getLastFocused();
  const left = Number.isInteger(current.left) && Number.isInteger(current.width)
    ? Math.round(current.left + Math.max(0, current.width - settings.width) / 2)
    : undefined;
  const top = Number.isInteger(current.top) && Number.isInteger(current.height)
    ? Math.round(current.top + Math.max(0, current.height - settings.height) / 3)
    : undefined;

  const createData = {
    focused: true,
    height: settings.height,
    type: "popup",
    url: switcherUrl,
    width: settings.width
  };
  if (Number.isInteger(left)) {
    createData.left = left;
  }
  if (Number.isInteger(top)) {
    createData.top = top;
  }

  await chrome.windows.create(createData);
}

async function toggleLastTab() {
  const current = await chrome.windows.getLastFocused();
  const [sourceTab] = await chrome.tabs.query({
    active: true,
    windowId: current.id
  });
  const {activeTabId, tabs} = await buildTabList(
    sourceTab?.id ?? null,
    sourceTab?.windowId ?? null
  );
  const target = tabs.find((tab) => tab.id !== activeTabId);
  if (target) {
    await activateTab(target.id);
  }
}

chrome.tabs.onActivated.addListener(({tabId}) => {
  rememberTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId) => {
  updateStoredTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeStoredTab(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  removeStoredTab(removedTabId);
  rememberTab(addedTabId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  const [tab] = await chrome.tabs.query({active: true, windowId});
  if (tab?.id) {
    rememberTab(tab.id);
  }
});

chrome.action.onClicked.addListener(() => {
  openSwitcher("search");
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-switcher") {
    openSwitcher("cycle");
  } else if (command === "open-search-switcher") {
    openSwitcher("search");
  } else if (command === "toggle-last-tab") {
    toggleLastTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case "get-tabs":
        return buildTabList(
          message.sourceTabId ?? null,
          message.sourceWindowId ?? null
        );
      case "get-settings":
        return getSettings();
      case "save-settings":
        return saveSettings(message.settings || {});
      case "activate-tab":
        await activateTab(message.tabId);
        return {ok: true};
      case "close-tab":
        await closeTab(message.tabId);
        return {ok: true};
      default:
        return {ok: false};
    }
  };

  run()
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ok: false, error: String(error)}));
  return true;
});

chrome.runtime.onStartup.addListener(async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.id) {
    await rememberTab(tab.id);
  }
});
