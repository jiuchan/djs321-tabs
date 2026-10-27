# 倒计时321 标签管家（DJS321 Tabs）

适用于 Chrome 和 Edge 的本地优先标签管理器：归档标签而不丢失，搜索和分组已打开的页面，把新标签页变成工作台。独立可用；发送到倒计时321 桌面 App 是可选功能。

> **状态：预发布。** 1.1.0 尚未上架 Chrome 应用商店或 Edge 加载项。各版本的联网请求见 [PRIVACY.md](PRIVACY.md)（英文）。

## 功能

- **归档与撤销**：保存标签并关闭，或保留不关，之后按原网址恢复。
- **搜索**：在弹窗或新标签页中查找已打开的标签和归档页面。
- **分组与视图**：按域名、浏览器标签组、窗口、时间或内容分类分组；以网格、紧凑列表或看板展示。
- **新标签页工作台**：时钟、搜索、常用导航和书签，支持顶部、侧边、经典三种布局与明暗主题。
- **导出与备份**：归档可导出为 JSON 或 Markdown；全部数据可备份与恢复。
- **可选发送**：一次配对后，把标签（可选附带正文）发送到倒计时321 桌面 App，或你自己的 HTTPS 地址。

## 快捷键

| 快捷键 | 操作 |
|---|---|
| `Alt+Shift+W` | 归档当前标签（不关闭） |
| `Alt+Shift+X` | 归档并关闭当前标签 |
| `Alt+Shift+J` | 将当前标签发送到倒计时321 收件箱 |

可在 `chrome://extensions/shortcuts` 或 `edge://extensions/shortcuts` 修改。

## 从源码构建

需要 Node.js 22（见 `.nvmrc`）。

```bash
npm ci
npm run build
```

打开 `chrome://extensions`（或 `edge://extensions`），开启“开发者模式”，点击“加载已解压的扩展程序”，选择 `dist` 文件夹。`npm test` 与 `npm run lint` 即 CI 所用检查。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。提交需带 DCO 签名（`git commit -s`）。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

代码采用 [Apache License 2.0](LICENSE)。“DJS321 Tabs”“倒计时321”“DJS 321”等名称与图标不在该许可范围内，见 [TRADEMARKS.md](TRADEMARKS.md)。
