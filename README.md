# Vrishn - Quick Tab Switcher

Fast MRU tab switching for Chrome, Edge, Brave, Helium, and other Chromium-based browsers.

Vrishn is a Manifest V3 browser extension inspired by QuicKey's
keyboard-first tab workflow: open a compact popup, cycle through recently used
tabs, release the modifier to switch, or search by title and URL.

## Features

- Most-recently-used tab list persisted across service worker restarts.
- Alt-tab-style popup mode with `Q` to move down and `Shift+Q` to move up.
- Search popup mode with fuzzy multi-token title and URL matching.
- Release-to-switch behavior after cycling.
- Current-window-only option.
- Hide pinned tabs option.
- Optional last-search restoration.
- Adjustable popup width and height.
- Custom accent color.
- Dark-mode-aware UI.

## Install for Development

1. Open `chrome://extensions`, `edge://extensions`, `brave://extensions`, or `helium://extensions`.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select this project directory.
5. Open **Keyboard shortcuts** and check the assigned shortcuts.

Suggested shortcuts:

- **Open alt-tab-style popup**: `Alt+Q` / `Option+Q`
- **Search in alt-tab-style popup**: `Alt+W` / `Option+W`
- **Switch to previous tab**: `Alt+Z` / `Option+Z`

On macOS, Chromium's shortcut recorder may capture `Option+Q` as a special
character. If that happens, remove and reload the unpacked extension so the
manifest default can be applied, or use a different shortcut while testing.

## Usage

Cycle mode:

1. Hold the launcher modifier and press the popup shortcut.
2. Press `Q` to move down.
3. Press `Shift+Q` to move up.
4. Release the modifier to switch to the selected tab.

Search mode:

1. Open the search popup.
2. Type part of a tab title or URL.
3. Use arrow keys, `Ctrl+N/J`, or `Ctrl+P/K` to move.
4. Press `Enter` to switch.

## Options

Open the extension options page to configure:

- Popup width and height.
- Accent color.
- Whether results are limited to the current browser window.
- Whether pinned tabs are hidden.
- Whether the last search query is restored.

## Website

The static landing page is in `site/`. Open `site/index.html` directly, or
serve it with:

```sh
python3 -m http.server 4173 --directory site
```

A store-ready `1280x800` promotional artwork export is kept in `store-assets/`.

## Privacy

The extension uses the `tabs` permission to read open tab titles, URLs, favicons,
and window IDs so it can search and switch between tabs. MRU order and settings
are stored locally in `chrome.storage.local`. The extension does not transmit
tab data to any server.

## License

Apache-2.0. See [LICENSE](LICENSE).
