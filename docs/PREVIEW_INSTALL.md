# DJS321 Tabs 1.1.0 Preview / 预览版

## 中文

仅适用于桌面 Chrome / Microsoft Edge，不支持 iOS 或 Safari。界面随浏览器语言显示中文或英文。
这是手动安装预览版，未经扩展商店审核，不会自动更新。

1. 解压到固定文件夹，安装后保留该文件夹。
2. 打开 `chrome://extensions/` 或 `edge://extensions/`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择直接包含 `manifest.json` 的文件夹，再打开新标签页。

更新前在设置中导出重要数据。替换原文件夹内的文件，在扩展管理页重新加载原扩展；不要先卸载或换路径，以免数据丢失或扩展 ID 改变。受管理的浏览器可能禁止安装，请勿绕过管理员限制。

在新标签页的设置中选择“导航布局 → 经典右侧”，即可使用居中大时钟和右侧导航；顶部与侧边布局仍然保留。窄窗口或高度不足时使用紧凑导航，不覆盖已保存的选择。归档、书签和导航数据共用，不因切换布局重建。

### 权限、联网和 App 连接

标签/分组、书签、存储、下载、通知和网站图标（`favicon`）权限用于整理、归档、导出与操作反馈；不再要求完整历史、会话或定时权限。安装会替换新标签页。正文仅在主动操作时通过 `activeTab` / `scripting` 提取；批量收集或自定义 HTTPS 发送按所选网站另行请求授权，可在设置撤销，不在安装时取得全部网站的访问权限。

归档等数据保存在浏览器本地；部分偏好使用浏览器同步。每日一言默认关闭，开启后访问 Hitokoto。在线壁纸/皮肤缩略图可能请求 Unsplash、Picsum 等图片服务，这些服务可能收到请求及 IP。网站图标从浏览器本地缓存读取，不联网。搜索提交给所选搜索引擎。完整接收方、数据及删除边界见随包 `privacy.html`。

本地核心功能不需要安装 App。可选发送功能需要支持新版配对协议的桌面 App：首次连接在 App 中核对配对码并批准，此后由 App 回传实际 localhost 端口并核验身份，不扫描端口，也不固定依赖 37373。握手页需打开在安装了此插件的浏览器资料中。旧版无认证桥接不能代替配对；升级后旧凭据可能需要重新授权。配对凭据仅存本机，不进入设置同步或 JSON 备份；只在点击发送时发送选定内容。iOS 不提供此桌面连接。

本包没有完成全部 Chrome/Edge 商店验收；遇到连接问题可继续使用独立的本地标签管理。问题反馈：support@djs321.com。

## English

Desktop Chrome / Microsoft Edge only; not iOS or Safari. The interface follows the browser language (English or Simplified Chinese).
This is a manually installed preview, not store-reviewed, with no automatic updates.

1. Extract into a permanent folder and keep it after installation.
2. Open `chrome://extensions/` or `edge://extensions/` and enable Developer mode.
3. Choose Load unpacked, select the folder directly containing `manifest.json`, then open a new tab.

Export important data in settings before updating. Replace files in the original folder and reload the existing extension. Do not uninstall first or change paths: this can lose data or change the extension ID. Managed browsers may block installation; do not bypass administrative restrictions.

Choose “Navigation layout → Classic right” in new-tab settings for the centered large clock and right-side navigation. Top and left-side layouts remain available. Narrow or short windows use compact navigation without overwriting the saved choice. Layout changes share the same data.

### Permissions, Network And App Connection

Tabs/groups, bookmarks, storage, downloads, notifications and site icons (`favicon`) support organization, archives, exports and action feedback. Full history, sessions and alarms permissions are no longer required. Installation replaces the new-tab page. Page text is extracted only on an explicit action using `activeTab` / `scripting`; batch collection and custom HTTPS sending request selected-site access separately, revocable in settings. Installation does not grant access to all websites.

Archives stay local; some preferences use browser sync. Quotes are off by default and contact Hitokoto only when enabled. Online wallpaper/skin thumbnails can contact Unsplash, Picsum and other image providers, which may receive requests and IP addresses. Site icons come from the browser's local cache without network requests. Searches go to the selected engine. See bundled `privacy.html` for recipients, data and deletion boundaries.

Local core features do not need the App. Optional sending requires a desktop App supporting the new pairing protocol: approve the first pairing in the App; subsequent connections verify its identity and use the localhost port returned by the App, without scanning or requiring port 37373. The handshake page must open in the browser profile containing this extension. Old unauthenticated bridges cannot replace pairing; old credentials may require fresh approval. Credentials stay local, outside settings sync and JSON backups. Only explicitly selected content is sent on request. iOS does not provide this desktop connection.

The complete Chrome/Edge store acceptance matrix is not yet finished. Local tab management remains usable without an App connection. Support: support@djs321.com.

## Licenses

Bundled open-source software retains its licenses in `THIRD-PARTY-NOTICES.txt`. DJS321 Tabs' own code is licensed under Apache-2.0 (source: https://github.com/jiuchan/djs321-tabs); its names and icons are not covered by that license (see TRADEMARKS.md in the repository).
