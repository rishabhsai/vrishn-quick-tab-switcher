const DEFAULT_SETTINGS = {
  accentColor: "#2f6fed",
  height: 420,
  hidePinnedTabs: false,
  limitToCurrentWindow: false,
  restoreLastSearch: false,
  width: 560
};

const widthInput = document.querySelector("#width");
const heightInput = document.querySelector("#height");
const widthValue = document.querySelector("#widthValue");
const heightValue = document.querySelector("#heightValue");
const accentColorInput = document.querySelector("#accentColor");
const accentColorValue = document.querySelector("#accentColorValue");
const statusText = document.querySelector("#status");
const hidePinnedTabsInput = document.querySelector("#hidePinnedTabs");
const limitToCurrentWindowInput = document.querySelector("#limitToCurrentWindow");
const restoreLastSearchInput = document.querySelector("#restoreLastSearch");

function extensionAvailable() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
}

function sendMessage(message) {
  if (!extensionAvailable()) {
    if (message.type === "get-settings") {
      return Promise.resolve(DEFAULT_SETTINGS);
    }
    if (message.type === "save-settings") {
      return Promise.resolve({
        ...DEFAULT_SETTINGS,
        ...message.settings
      });
    }
  }
  return chrome.runtime.sendMessage(message);
}

function isColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function applyAccentColor(value) {
  if (isColor(value)) {
    document.documentElement.style.setProperty("--accent", value);
  }
}

function updateLabels() {
  widthValue.value = `${widthInput.value}px`;
  heightValue.value = `${heightInput.value}px`;
  accentColorValue.value = accentColorInput.value.toUpperCase();
  applyAccentColor(accentColorInput.value);
}

async function loadSettings() {
  const settings = await sendMessage({type: "get-settings"});
  accentColorInput.value = isColor(settings.accentColor)
    ? settings.accentColor
    : DEFAULT_SETTINGS.accentColor;
  widthInput.value = settings.width || DEFAULT_SETTINGS.width;
  heightInput.value = settings.height || DEFAULT_SETTINGS.height;
  hidePinnedTabsInput.checked = Boolean(settings.hidePinnedTabs);
  limitToCurrentWindowInput.checked = Boolean(settings.limitToCurrentWindow);
  restoreLastSearchInput.checked = Boolean(settings.restoreLastSearch);
  updateLabels();
}

async function saveSettings(settings) {
  const saved = await sendMessage({type: "save-settings", settings});
  accentColorInput.value = saved.accentColor || DEFAULT_SETTINGS.accentColor;
  widthInput.value = saved.width;
  heightInput.value = saved.height;
  hidePinnedTabsInput.checked = Boolean(saved.hidePinnedTabs);
  limitToCurrentWindowInput.checked = Boolean(saved.limitToCurrentWindow);
  restoreLastSearchInput.checked = Boolean(saved.restoreLastSearch);
  updateLabels();
  statusText.textContent = "Saved";
  setTimeout(() => {
    statusText.textContent = "";
  }, 1400);
}

widthInput.addEventListener("input", updateLabels);
heightInput.addEventListener("input", updateLabels);
accentColorInput.addEventListener("input", updateLabels);

document.querySelector("#save").addEventListener("click", () => {
  saveSettings({
    accentColor: accentColorInput.value,
    height: heightInput.value,
    hidePinnedTabs: hidePinnedTabsInput.checked,
    limitToCurrentWindow: limitToCurrentWindowInput.checked,
    restoreLastSearch: restoreLastSearchInput.checked,
    width: widthInput.value
  });
});

document.querySelector("#reset").addEventListener("click", () => {
  saveSettings(DEFAULT_SETTINGS);
});

document.querySelector("#openShortcuts").addEventListener("click", () => {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({url: "chrome://extensions/shortcuts"});
  }
});

loadSettings();
