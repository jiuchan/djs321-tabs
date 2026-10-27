# DJS321 Tabs Privacy Policy for Google Chrome / Google Chrome 隐私政策

Draft updated / 草稿更新：2026-10-10

> RELEASE DRAFT, NOT YET PUBLISHED. 本文是商店候选版草稿，不是已发布政策或账号持有人签署的声明。下文的默认关闭语录、按操作提取、逐站点授权、撤销授权、端点限制和备份验证须与最终安装包核对后才能公开。This draft describes the intended store candidate; quote defaults, action-only extraction, per-site grants, revocation, endpoint restrictions, and backup validation still require final-package verification.

Prospective public URL / 拟公开地址：[Chrome privacy page](https://djs321.com/tab-butler/privacy-chrome) **NOT YET DEPLOYED / 尚未部署**。This file does not establish that the URL is live.

## 中文

### 1. 适用范围与用途

本政策针对运行于桌面 Google Chrome 的 DJS321 Tabs 扩展，说明其标签整理、归档、撤销、快捷导航、书签和可选发送功能的数据处理。扩展替换新标签页，界面随浏览器语言显示中文或英文；无需安装倒计时321 App 即可使用本地核心功能。本政策不替代 Google Chrome、搜索服务、图片服务或收件 App 自身的政策。

本地优先不等于零数据处理或零网络请求。经检查的源码没有分析、广告或广告追踪 SDK，也没有开发者运营的标签上传/分析接口；用户主动选择的接收端、浏览器同步服务和以下第三方服务仍可能收到数据。

### 2. 访问的数据与用途

| 数据 | 用途与范围 |
| --- | --- |
| 已打开标签的标题、URL、窗口/分组标识、可用的最近访问时间 | 在弹窗/新标签页显示、搜索、分类、切换、归档和执行用户选择的单项或批量操作。不是读取浏览器完整历史记录。 |
| 归档与撤销记录 | 保存标题、URL、归档/关闭时间，以及记录中已有的备注/分组；撤销重新打开对应已保存 URL，不恢复浏览器全局最近关闭会话。 |
| 快捷链接 | 保存标题、URL、排序、分类及用户填写的可选提示词；用于个人导航。 |
| Chrome 书签 | 读取书签树、标题、URL、文件夹以展示和搜索；用户操作可新建书签/文件夹、修改或移动书签。书签仍归 Chrome 管理。 |
| 用户选择页面的文章正文 | 仅在明确的提取/发送操作中，用随包的 Readability 与 Turndown 在浏览器内转成 Markdown，供该次发送使用；普通浏览不自动抓取所有页面正文。 |
| 偏好、操作记录与站点规则 | 保存主题、布局、入口顺序、搜索引擎、壁纸、语录开关、App 地址、操作后关闭偏好、最近操作及站点对应的书签文件夹/导航分类。 |

URL、页面标题、正文、备注或提示词可能包含个人信息或带令牌的链接，请勿发送不希望交给接收端的内容。源码未实现密码、支付表单或 Cookie 的专门采集功能，但不能保证用户选择的文章或 URL 本身不含敏感信息。

### 3. 正文提取与授权

在当前页面点击扩展入口并执行提取/发送，或执行相应快捷键时，候选版使用 `activeTab` 的临时访问及 `scripting` 注入随包提取器。浏览器会限制内部页面、商店页面和其他受保护页面；文件页面还受 Chrome 的文件访问设置约束，不能承诺所有页面都可提取。提取失败时，不应被显示为正文发送成功。

非当前标签或批量正文提取需要针对所选站点的明确授权流程。清单中的 `optional_host_permissions` 为 `http://*/*` 与 `https://*/*`，表示可供请求的范围，不是安装时授予全部网站权限。候选版只请求用户选中的具体站点，按 URL 的协议和 host（包含显式端口）构造请求，不请求通配所有站点的授权；已有授权可在后续明确操作时使用，直至撤销。浏览器站点授权不等于只允许某一个页面路径，端口限制的实际效果须在 Chrome 中验证，端点的完整地址仍须由扩展验证。[Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[optional permissions documentation](https://developer.chrome.com/docs/extensions/reference/api/permissions)。

授权仅允许访问，不会自动触发正文提取或发送。可拒绝授权，并在设置中的撤销授权按钮或 Chrome 扩展详情的站点访问控制中撤销可选站点权限。固定的默认本机权限不是可选授权；若要停止扩展所有活动，可在 `chrome://extensions` 禁用或移除 DJS321 Tabs。

### 4. 网络请求与接收方

| 接收方 | 何时请求、发送什么、如何停止 |
| --- | --- |
| Google Chrome 同步服务 | `chrome.storage.sync` 保存分组、视图、主题、布局、默认入口/顺序、语录开关及配置的 App 地址。若 Chrome 同步启用，Google 的同步基础设施可处理这些偏好；关闭浏览器同步可停止后续偏好同步。归档/撤销/快捷链接未通过此机制自动同步。[Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)。 |
| Hitokoto，一言：`v1.hitokoto.cn` | `enableRemoteQuotes` 默认 `false`。用户开启后，新标签页的每日一言功能请求语录及固定分类参数；标签列表和文章正文不作为该请求的参数。关闭语录开关可停止后续语录请求；“每日”不是每天仅请求一次的保证。 |
| Unsplash：`images.unsplash.com`；Picsum：`picsum.photos` 及其图片/CDN 重定向接收方 | 用户选择在线壁纸后显示图片；打开皮肤对话框即可能加载 Unsplash 预设缩略图，无需先选中壁纸。在线图库、主题分类、翻页或悬停预览可请求 Picsum 列表/图片。默认无壁纸。选择“无壁纸”或本地图片可停止所选远程背景的后续加载，但再次打开皮肤对话框仍可能请求缩略图。 |
| 用户配置的图片地址及其托管方 | 应用自定义图片 URL 后由浏览器加载该图片；本地上传的图片以 data URL 保存在本地，不为该功能上传。改为无壁纸/本地图片可避免后续自定义远程背景请求。 |
| 网站图标 | 不产生网络请求。图标通过 `favicon` 权限从 Chrome 本地图标缓存（`_favicon`）读取，不访问原网站、CDN 或任何第三方图标服务；浏览器未缓存过的站点显示通用占位图标。旧版本保存的远程图标地址不再用于显示。 |
| 用户选择的搜索服务 | 在新标签页提交搜索后，查询交给所选 Google、Bing、Baidu、GitHub 或 Perplexity；直接输入网址会导航到该地址。仅在本地过滤标签/书签而不提交外部搜索时，不会为此把搜索词发给搜索引擎。扩展不改 Chrome 地址栏的默认搜索引擎。 |
| 本机 App 或用户配置且授权的 HTTPS 接收端 | 仅在用户执行发送/收集/工作区保存等含发送的操作时，向配置地址的 `/api/inbox` POST 标题、URL、可选备注及成功提取的 Markdown（如该操作包含提取），另含来源 `tab-butler`、时间戳及领域分类。部分批量/书签操作只发送标题与 URL。接收端按自身设置保存、同步或进一步处理；需向接收端删除已发送副本。 |

本机 App 使用系统分配的实际端口 `http://localhost:<端口>`，不扫描端口、不访问局域网、不使用云端寻找 App。本插件的必需主机权限为仅限本机多端口的 `http://localhost/*`；网页外部消息仅允许 `/bridge/connect` 握手页，且必须通过当前浏览器已登记 nonce、插件身份、有效期、签名和重连时已保存 App 公钥的核验。高级设置仅接受明确授权的自定义 HTTPS 服务并保留原有发送格式，本机旧设置中的地址只选择本机模式，不决定实际发送端口。无旧版无认证接口或猜测端口的回退。保存 HTTPS 地址不是发送内容的同意；本机令牌不附加到 HTTPS 服务。回环 HTTP 是未加密本机通信，不是端到端加密；仅连接可信 App。动态连接需要新版桌面候选，Windows/MAS 安装兼容仍需实际验收。

只有明确点击连接才打开 `djs321-desktop://pair`；重连使用 `djs321-desktop://connect`。两个链接只包含插件身份 `chrome-extension://<扩展 ID>` 和随机 nonce，不含令牌或页面内容。App 在系统默认浏览器打开本机 `/bridge/connect` 页，通过 nonce 绑定的 P-256 公钥签名回传实际端口；页面无外部资源，外部消息只返回是否接受，不返回凭据或执行发送。必须在装有此插件的浏览器资料打开；错误浏览器或资料会失败，用户需在正确资料重试，不承诺 App 换端口后无需握手的静默发现。首次配对须原生 App 核对六位码并批准，插件最多等三分钟；获批后保存 App 公钥身份。打开设置仅检查已有已核验端点；未配对不猜测端口。每次状态认证、发送、撤销及已知身份的取消清理前，先向 `/bridge/identity?challenge=...` 请求并验证新签名；身份不符不发送令牌或任务。所有桥接请求含 `X-DJS321-Client`，认证请求另含本机令牌；任务只随用户明确发送动作传出，认证发送含重试请求编号。

配对令牌、扩展身份、实际端点和 App 公钥仅存于当前浏览器的 `chrome.storage.local`，不进入设置同步或 JSON 备份，也不附加到自定义 HTTPS 服务请求。nonce 和签名发现结果暂存本机，登记有效期最长三分钟、完成/取消清除；中断残留在后续登记时按有效期清理。旧版缺少 App 公钥的凭据需重新配对，不猜测身份。“断开配对”立即移除活动凭据并向 App 请求撤销；若 App 未运行或撤销未确认，仅保留非活动待撤销记录，不能用于发送或认证状态。端口变化时先重新握手，再明确点击断开完成撤销；重连待撤销记录不会重新启用发送。确认撤销或令牌无效后清除两份记录，新配对获批清除旧待撤销记录。清除扩展存储不确认 App 撤销，断开不删除已发送内容。

点击“打开 App / 重新连接”后等待签名握手最多 20 秒，不重新批准配对或发送内容。配对进行中的独立打开链接仅唤醒，不替换配对 nonce。取消/超时仅在已发现并重新核验 App 身份时尝试一次独立限时、仅含 nonce 的 `/bridge/cancel`；没有可核验端点时不发请求，App 自身配对有效期仍会到期。失败不无限重试，取消后的迟到令牌不能用于发送。

网络接收方通常能看到请求 URL、IP 地址、请求时间以及浏览器发送的网络元数据；Cookie/Referrer 是否包含在请求中取决于浏览器和请求类型。图片请求可能经重定向到 CDN。扩展不能保证第三方、浏览器同步服务或用户接收端不记录请求、立即删除日志或在特定地区处理。关闭功能或撤销授权不能收回已经传出的数据，也不等于删除第三方缓存/日志。

### 5. 存储、保留与导出

归档、撤销与快捷链接存于此 Chrome 配置文件下的 IndexedDB `TabButlerDB`（`archived`、`undo`、`quickLinks`）。操作后关闭偏好、最近操作（当前逻辑最多 6 条）、最近书签文件夹及站点规则存于 `chrome.storage.local`。壁纸 URL/本地图片、模糊/遮罩设置、弹窗主题、搜索引擎、书签/导航视图等存于扩展的 `localStorage`。偏好同步如上所述，并非全部数据都仅存在这台电脑。

本地记录没有统一按天自动过期保证：归档、快捷链接、撤销与规则保留至删除、覆盖导入或清除扩展存储；最近操作按数量滚动替换。这些存储和导出的 JSON/Markdown 未提供扩展自有的加密保护，请使用系统/浏览器保护设备和文件。

弹窗支持归档 JSON/Markdown 导出和单独规则 JSON 导出；新标签页设置支持包含设置、归档、撤销、快捷链接的 JSON 备份。完整备份不包含全部 `chrome.storage.local`/`localStorage` 辅助偏好，也不是浏览器书签的完整备份；书签请用 Chrome 书签管理器导出。备份可含 App 地址、壁纸/本地图片、URL 和备注，妥善保管。导出生成本地文件，不会自动上传；文件夹云备份或主动分享仍可使副本离开设备。

导入会替换备份中包含的本地集合并恢复设置；备份若保存了已开启的语录或远程壁纸，恢复这些偏好可能产生后续网络请求。仅导入自己信任并已检查的备份。导入不会自行授予浏览器站点权限；自定义端点仍须具备相应授权。数据库集合事务不等于数据库、同步偏好和 localStorage 跨系统原子恢复。

### 6. 删除与退出

可在归档列表删除单条记录、在导航中删除快捷链接、在规则库删除对应规则；已创建的书签请在 Chrome 书签管理器删除。删归档不同时删除撤销/最近操作中的同一 URL。当前没有覆盖所有存储的一键清除按钮；完整清理需清除此扩展的 IndexedDB、`chrome.storage.local`、`localStorage`，或通过 Chrome 管理扩展移除它，并核对本机数据是否仍保留。禁用扩展只停止运行，不删除数据。

清理本机不保证清除 Google 同步副本、其他设备、下载的备份、系统备份、浏览器书签或已发送到 App/HTTPS 接收端的内容。同步副本按 Google Chrome 的同步管理方式处理；各备份及接收端副本须分别删除。停止发送可不再使用发送动作并撤销可选目标权限；默认本机权限可通过禁用/移除扩展停止使用。

### 7. 联系与变更

隐私、数据访问/导出、清理指导或问题反馈：[support@djs321.com](mailto:support@djs321.com)。扩展本地数据没有自动送到开发者，处理支持请求时请只提供必要信息，不要默认附上完整备份。功能、接收方或数据处理变化时应同步修订政策并更新日期；本草稿的公开生效日期仍待账号持有人确认。

## English

The App public key and actual endpoint are also local-only, outside settings sync and backups. Nonces and signed discovery results remain locally for at most three minutes per registration and are cleared on completion/cancellation, or pruned by expiry on a later registration after interruption. Older unpinned credentials require fresh pairing. Reconnecting an inactive pending-revocation record updates its endpoint only, never enables sends; explicitly retry Disconnect to finish revocation.

### 1. Scope and purpose

This policy covers DJS321 Tabs for desktop Google Chrome: organizing tabs, archives, saved-URL undo, quick links, bookmarks, and optional sending. It replaces the new-tab page and shows a Chinese or English interface following the browser language. Local core features do not require the DJS 321 App. This policy does not replace the policies of Google Chrome, image/search providers, or a receiving App.

Local-first does not mean zero data handling or zero network requests. The inspected source has no analytics, advertising, or ad-tracking SDK and no developer-operated tab-upload/analytics endpoint. User-selected recipients, browser sync, and the services below may nevertheless receive information.

### 2. Data accessed and used

The extension reads open-tab titles, URLs, window/group identifiers and available last-access times for display, local search, grouping, switching and selected actions. It does not read the browser's full history database. Archives hold titles, URLs, archive times and any existing note/group fields; undo holds titles, URLs and close times. Undo reopens the corresponding saved URL, not the browser-global recently closed session.

Quick links store titles, URLs, order, categories and optional user-entered prompts. Chrome bookmarks are read for browsing/search; user actions can create bookmarks/folders, edit or move bookmarks. They remain browser-managed bookmarks. Preferences and local action/rule records support layout, theme, navigation, search, wallpaper, quotes, App configuration, close-after-action and preferred site destinations.

Only an explicit extraction/send action processes a selected page with bundled Readability and Turndown to produce Markdown for that send. Normal browsing does not automatically extract every page. URLs, titles, articles, notes and prompts can contain personal information or token-bearing links. The inspected source does not specifically collect passwords, payment forms or cookies, but user-selected content may itself contain sensitive information.

### 3. Extraction and access controls

For the current page, invoking the extension action and selecting extraction/send, or using the relevant shortcut, uses temporary `activeTab` access with `scripting` and a bundled extractor. Browser-internal, store and protected pages have restrictions; local-file access also depends on Chrome's file-access setting. Extraction is not guaranteed on every page; failure must not be presented as successful article delivery.

Non-active/batch article extraction requires an explicit permission flow for the selected sites. `optional_host_permissions` contains `http://*/*` and `https://*/*` as requestable scopes, not an installation-time grant to all websites. Requests use the selected URL's scheme and host, including an explicit port, never a blanket wildcard grant. Existing grants can be reused for later explicit actions until revoked. A browser site grant is not restricted to one page path; actual port confinement needs Chrome testing, and the extension must separately validate full endpoint addresses. [Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [optional permissions documentation](https://developer.chrome.com/docs/extensions/reference/api/permissions).

Permission does not itself start extraction or sending. Deny optional access or use the settings revocation button/Chrome extension site-access controls to remove optional grants. The fixed default localhost permission is not an optional grant. Disable/remove DJS321 Tabs at `chrome://extensions` to stop all extension activity.

### 4. Network recipients

- Google Chrome sync: `chrome.storage.sync` holds grouping, view, theme, layout, default section/order, the quote switch and the configured App address. If Chrome sync is enabled, Google's sync infrastructure may process these preferences. Turn browser sync off to stop future preference syncing. Archives, undo and quick links are not automatically synced by this mechanism. [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Hitokoto (`v1.hitokoto.cn`): `enableRemoteQuotes` defaults to `false`. Enabling it allows new-tab quote requests with fixed category parameters, not tab lists or article bodies. Disable the switch to stop future requests. “Daily quote” does not promise only one request per day.
- Unsplash (`images.unsplash.com`) and Picsum (`picsum.photos`, including image/CDN redirect recipients): selected remote wallpapers load images; simply opening the skin dialog may load Unsplash preset thumbnails before any selection. Online gallery, theme, pagination and hover previews can load Picsum lists/images. The default has no wallpaper. Choosing no wallpaper or a local image stops future selected remote-background loads, but reopening the skin dialog may still load thumbnails.
- Custom image hosts: applying a remote image URL loads it from its host. A local image is stored as a local data URL, not uploaded for this feature. Switch to no wallpaper/a local image to avoid future custom remote-background loads.
- Site icons: no network requests. Icons are read from Chrome's local favicon cache (`_favicon`, via the `favicon` permission), never from the original website, a CDN or a third-party icon service. Sites the browser has not cached show a generic placeholder. Remote icon URLs saved by older versions are no longer displayed.
- Chosen search provider: submitting new-tab search sends the query to Google, Bing, Baidu, GitHub or Perplexity as selected; an address navigates directly to that site. Local tab/bookmark filtering without external submission does not send the query to a search engine. Chrome's address-bar default search provider is not changed.
- Local App or authorized configured HTTPS recipient: an explicit send/collect/workspace action that includes sending POSTs to the configured `/api/inbox`. The payload has title, URL, an optional note when supplied, and successfully extracted Markdown when included by that action, plus `tab-butler` source, timestamp and area/category. Some batch/bookmark actions send title/URL only. The recipient's own storage/sync/processing rules apply.

The App uses its OS-assigned actual port at `http://localhost:<port>`. There is no port scan, LAN discovery, cloud rendezvous or native messaging helper. Required host access is only `http://localhost/*` across local ports; external web messages are allowed only from `/bridge/connect` and additionally require this profile's registered nonce, extension identity, bounded expiry, valid signature and, on reconnect, the pinned App key. Historical local settings select local mode, not the destination port. Advanced settings accept explicitly granted custom HTTPS services with the legacy payload, never local credentials. No guessed-port or unsigned fallback is used. Saving an endpoint is not sending consent. Loopback HTTP is unencrypted local communication, not end-to-end encryption. Dynamic pairing requires a new desktop candidate; installed Windows/MAS acceptance remains a separate gate.

An explicit Connect click opens `djs321-desktop://pair`; reconnect uses `djs321-desktop://connect`. Both carry only the extension identity `chrome-extension://<extension ID>` and a nonce, not a token or page content. The App opens a bundled local `/bridge/connect` handshake in the system default browser and announces its actual port with nonce-bound P-256 public-key proof. The page has no external resources; external messaging returns acceptance only, never credentials or send actions. The page must open in a profile containing this extension. A wrong browser/profile fails visibly and needs a retry in the correct profile; silent arbitrary-port discovery without this handshake is not promised. Initial pairing still requires native six-character-code approval, waits at most three minutes and pins the App key only upon approval. Settings probe only an existing known endpoint, never scan when unpaired. Before authenticated status, sends, revocation and known-identity cancellation cleanup, `/bridge/identity?challenge=...` provides fresh signature verification. An identity mismatch sends no token or task. All bridge calls carry `X-DJS321-Client`; authenticated calls also carry the local token. Subsequent explicit sends retain request identifiers for retry receipts.

The pairing token and extension identity stay in this browser's `chrome.storage.local`, not settings sync or JSON backup, and are not sent to custom HTTPS services. Disconnect removes the active credential immediately and requests App-side revocation. If the App is stopped or revocation is unconfirmed, an inactive local pending-revocation credential remains solely for an explicit Disconnect retry; it cannot authenticate status or sends. Open the App, then click Disconnect again. Confirmed revocation or an invalid token clears both records; successful new pairing clears obsolete pending revocation. Clearing extension storage removes these local credentials but does not confirm App-side revocation or delete delivered content.

An explicit Open App / Reconnect click waits for a signed handshake for at most 20 seconds without pairing approval or content delivery. During pairing, the separate plain wake link does not replace the pairing nonce. Cancellation/expiry attempts one independently bounded nonce-only `/bridge/cancel` only if an endpoint is known and its App identity can be freshly verified; otherwise no cancellation request is made and the App's own pairing expiry applies. Failures never cause unlimited retries or late-token resurrection.

Network recipients can generally observe the requested URL, IP address, request time and browser-supplied network metadata. Cookies/referrers depend on the browser and request type. Redirects can involve image CDNs. The extension cannot guarantee no provider logs, immediate log deletion, or a processing location. Disabling features/revoking access cannot retract data already transmitted or erase third-party caches/logs.

### 5. Storage, retention and export

IndexedDB `TabButlerDB` in this Chrome profile stores `archived`, `undo` and `quickLinks`. `chrome.storage.local` holds close-after-action, recent actions (currently capped at 6), the recent bookmark folder and site-rule maps. Extension `localStorage` holds wallpaper URL/local image, blur/dimming, popup theme, search engine and bookmark/navigation view preferences. Synced preferences are described above; not all data is confined to this device.

There is no uniform time-based expiry: archives, undo, quick links and rules persist until deletion, replacement import or extension-storage cleanup; recent actions roll over by count. These stores and exported JSON/Markdown do not have extension-provided encryption. Protect the device/profile and exported files.

The popup exports archives as JSON/Markdown and rules as separate JSON. New-tab settings exports a JSON backup of settings, archives, undo and quick links. It is not a complete export of all `chrome.storage.local`/`localStorage` preferences or browser bookmarks; export bookmarks with Chrome's bookmark manager. Backups may contain App addresses, wallpaper/local images, URLs and notes. Exports create local files, not automatic uploads; folder cloud backup or deliberate sharing can create remote copies.

Import replaces included local collections and restores settings. Restoring a previously enabled quote switch or remote wallpaper may cause subsequent network requests. Import only trusted, inspected backups. Import does not itself grant browser site permissions; custom endpoints still need appropriate access. A database transaction does not make database, sync-preference and localStorage restoration atomic across all systems.

### 6. Deletion and stopping use

Delete individual archives, quick links or site rules in their respective views. Delete created bookmarks in Chrome's bookmark manager. Deleting an archive does not also delete the same URL from undo/recent actions. There is currently no single clear-all control covering every store. Full cleanup requires clearing the extension's IndexedDB, `chrome.storage.local` and `localStorage`, or removing the extension through Chrome and checking local retention. Disabling stops execution, not storage retention.

Local cleanup does not guarantee deletion of Google sync copies, other devices, downloaded/system backups, browser bookmarks or already-sent App/HTTPS copies. Manage sync copies with Google Chrome and delete files/recipient copies separately. Stop sending by avoiding send actions and revoking optional destination grants; disable/remove the extension to stop use of its fixed localhost permission.

### 7. Contact and updates

For privacy questions, access/export or cleanup help: [support@djs321.com](mailto:support@djs321.com). Local extension data is not automatically sent to the developer. Share only necessary support information, not a full backup by default. Material feature/recipient/data changes require a policy/date update. The public effective date remains pending account-holder confirmation.
