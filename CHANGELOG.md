# Changelog

## [Unreleased]

### Changed
- Renamed to **DJS321 Tabs** (English) / **倒计时321 标签管家** (Chinese). Manifest name and description come from `_locales` (`en` default, `zh_CN`); the UI reads the name via `chrome.i18n`. Storage and bridge identifiers (`TabButlerDB`, source `tab-butler`, pairing protocol) are unchanged, so existing data and desktop pairing keep working

### Added
- Configurable DJS 321 endpoint — the push target (default `http://localhost:37373`) is editable in Options → "倒计时321 连接"; read from `chrome.storage.sync` (service-worker-safe, no `localStorage`)
- Push retry with exponential backoff — `sendToJustDoIt` retries transient failures (network / 5xx); 4xx and business rejections are not retried. Fixes the core feature silently failing when the desktop app is momentarily down or on a non-default port
- ESLint (flat config) + Prettier quality gate; `@typescript-eslint/no-explicit-any` enforced as **error**
- `npm test` script — the existing `node:test` suites are now runnable (33 tests)

### Changed
- Eliminated all 28 `any` usages → type-safe error handling (`errMsg` helper), icon `SVGProps`, `chrome.bookmarks.BookmarkTreeNode` — `strict` mode is now meaningful
