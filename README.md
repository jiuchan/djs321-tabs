# DJS321 Tabs

A local-first tab manager for Chrome and Edge: archive tabs without losing them, search and group
what is open, and turn the new-tab page into a workspace. It works on its own; sending tabs to the
DJS 321 desktop app is optional.

中文说明见 [README.zh-CN.md](README.zh-CN.md)。

> **Status: pre-release.** Version 1.0.1 is not yet in the Chrome Web Store or Edge Add-ons. Most of
> the interface is still in Chinese while strings move to `_locales`. See [PRIVACY.md](PRIVACY.md)
> for the network requests the current version makes.

## Features

- **Archive and undo**: save a tab and close it, or keep it open, then restore the exact URL later.
- **Search**: find open tabs and archived pages from the popup or the new-tab page.
- **Group and view**: group by domain, browser tab group, window, time or content category; show
  them as a grid, compact list or kanban board.
- **New-tab workspace**: clock, search, quick links and bookmarks, with top, side or classic layouts
  and light and dark themes.
- **Export and backup**: export archives as JSON or Markdown; back up and restore all data.
- **Optional sending**: send tabs, with captured page text if you choose, to the DJS 321 desktop app
  after a one-time pairing, or to your own HTTPS endpoint.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+W` | Archive the current tab and keep it open |
| `Alt+Shift+X` | Archive and close the current tab |
| `Alt+Shift+J` | Send the current tab to the DJS 321 inbox |

Change them at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

## Build from source

Requires Node.js 22 (see `.nvmrc`).

```bash
npm ci
npm run build
```

Then open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click
**Load unpacked** and choose the `dist` folder. `npm test` and `npm run lint` run the checks used
in CI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Commits need a DCO sign-off (`git commit -s`). Report
security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Code is licensed under the [Apache License 2.0](LICENSE). The names "DJS321 Tabs", "倒计时321",
"DJS 321" and the icons are not covered by that license; see [TRADEMARKS.md](TRADEMARKS.md).
