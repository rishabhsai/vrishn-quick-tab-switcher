const DEFAULT_SETTINGS = {
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
const statusText = document.querySelector("#status");
const hidePinnedTabsInput = document.querySelector("#hidePinnedTabs");
const limitToCurrentWindowInput = document.querySelector("#limitToCurrentWindow");
const restoreLastSearchInput = document.querySelector("#restoreLastSearch");

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function updateLabels() {
  widthValue.value = `${widthInput.value}px`;
  heightValue.value = `${heightInput.value}px`;
}

async function loadSettings() {
  const settings = await sendMessage({type: "get-settings"});
  widthInput.value = settings.width || DEFAULT_SETTINGS.width;
  heightInput.value = settings.height || DEFAULT_SETTINGS.height;
  hidePinnedTabsInput.checked = Boolean(settings.hidePinnedTabs);
  limitToCurrentWindowInput.checked = Boolean(settings.limitToCurrentWindow);
  restoreLastSearchInput.checked = Boolean(settings.restoreLastSearch);
  updateLabels();
}

async function saveSettings(settings) {
  const saved = await sendMessage({type: "save-settings", settings});
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

document.querySelector("#save").addEventListener("click", () => {
  saveSettings({
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
  chrome.tabs.create({url: "chrome://extensions/shortcuts"});
});

loadSettings();
