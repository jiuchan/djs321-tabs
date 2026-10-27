# Privacy

> **Pre-release (1.0.1).** This page describes what the current code does. The goal for the first
> store release is **zero third-party requests with default settings**; the items marked *planned*
> below track the remaining work.

DJS321 Tabs is a local-first tab manager. It has **no account, no analytics and no telemetry**, and
it never sends your tabs, bookmarks or page text to the developer.

## Data stays in your browser

Archived tabs, quick links, wallpapers you upload and backups are stored locally in IndexedDB and
`chrome.storage.local`. Some preferences use `chrome.storage.sync`, so your browser may sync them
across your own devices. Pairing credentials for the desktop app stay on this device and are never
included in settings sync or JSON backups.

## Network requests

| What | When | Where it goes |
|---|---|---|
| Preset wallpapers | When you open the skin panel, or when a preset wallpaper is selected | `images.unsplash.com`. The default is no wallpaper. *Planned:* bundle a few CC0 images and make the online source opt-in with attribution. |
| Online wallpaper gallery | Only when you open the gallery tab in the skin panel | `picsum.photos` |
| Daily quote | Off by default; only when you enable it | `v1.hitokoto.cn`, without cookies or tab data |
| Web search | When you submit a search from the new-tab page | The search engine you selected |
| Send to DJS 321 desktop | Only when you click send, after pairing | Title, URL and, if the action includes it, captured page text, sent to the DJS 321 app on this computer (`localhost`) after you approve a six-digit pairing code |
| Custom HTTPS endpoint | Only when you configure one and click send | The tabs you choose to send, to the exact HTTPS address you configured; the browser asks for permission for that site first |
| Capture page text | Only when you trigger it | Runs locally with bundled Readability and Turndown; nothing leaves the browser unless you also send it |

Site icons are read from the browser's local favicon cache (`_favicon`) and cause no network
requests, neither to the website itself nor to an icon service.

Any website or service you contact this way receives your IP address and normal request headers, as
with any web request.

## Permissions

Requested at install: `tabs`, `tabGroups`, `storage`, `notifications`, `downloads`, `bookmarks`,
`activeTab`, `scripting`, `favicon` (site icons from the browser's local cache, no network request), and `http://localhost/*` for the desktop app connection. Access to other
websites is optional and requested per site when you capture or send; revoke it in the extension
settings or the browser's extension page. *Planned:* move `notifications`, `downloads` and the
localhost permission to optional permissions requested on first use.

## Contact

Questions or concerns: open an issue, or for anything sensitive contact support@djs321.com.
