import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const inline = text => escape(text)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => /^(https?:|mailto:)/.test(href) ? `<a href="${href}" rel="noreferrer">${label}</a>` : label)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

export function renderPolicyMarkdown(markdown) {
  const start = markdown.indexOf('## 中文')
  if (start === -1) throw new Error('Missing bilingual policy body')
  const output = []
  let table = false
  for (const line of markdown.slice(start).split('\n')) {
    if (line.startsWith('|')) {
      if (!table) { output.push('<div class="table-scroll"><table>'); table = true }
      if (/^\|[\s|:-]+\|$/.test(line)) continue
      output.push(`<tr>${line.split('|').slice(1, -1).map(cell => `<td>${inline(cell.trim())}</td>`).join('')}</tr>`)
      continue
    }
    if (table) { output.push('</table></div>'); table = false }
    if (!line.trim()) continue
    const heading = /^(#{2,4}) (.*)$/.exec(line)
    if (heading) output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
    else output.push(`<p>${inline(line.replace(/^- /, '• '))}</p>`)
  }
  if (table) output.push('</table></div>')
  return output.join('\n')
}

const style = `:root{color-scheme:light dark}body{margin:0;background:light-dark(#f4f6f8,#10151d);color:light-dark(#162033,#edf2fb);font:16px/1.75 Georgia,"Songti SC",serif}main{max-inline-size:960px;margin:48px auto;padding:32px;overflow-wrap:anywhere}h1,h2,h3{font-family:"Avenir Next","PingFang SC",sans-serif;line-height:1.3}h2{margin-block-start:48px}a{color:light-dark(#174f99,#9dc3ff)}code{font-size:.9em}table{border-collapse:collapse;min-inline-size:520px}td{border:1px solid light-dark(#c9d2e0,#36465e);padding:14px;vertical-align:top}.table-scroll{overflow:auto}nav{display:flex;gap:24px;flex-wrap:wrap}.notice{border-inline-start:3px solid #4c78b9;padding-inline-start:16px}@media(max-width:600px){main{margin:12px auto;padding:20px}h1{font-size:28px}}`
const page = (title, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title><style>${style}</style></head><body><main><h1>${escape(title)}</h1><p class="notice">2026-10-17 · 桌面预览版随包数据与联网说明，扩展商店审核尚未完成。Preview data and network notice; not store-reviewed.</p>${body}</main></body></html>`

async function build() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  for (const name of ['chrome', 'edge']) {
    const markdown = await readFile(resolve(root, `docs/PRIVACY_${name.toUpperCase()}.md`), 'utf8')
    await writeFile(resolve(root, `public/privacy-${name}.html`), page(`DJS321 Tabs · ${name === 'chrome' ? 'Chrome' : 'Microsoft Edge'} 隐私说明 / Privacy`, renderPolicyMarkdown(markdown)))
  }
  await writeFile(resolve(root, 'public/privacy.html'), page('DJS321 Tabs · 隐私说明 / Privacy', '<nav><a href="privacy-chrome.html">Chrome · 中文 / English</a><a href="privacy-edge.html">Microsoft Edge · 中文 / English</a></nav><p>请选择所用浏览器，阅读随包的完整数据与联网说明。Choose your browser for complete bundled data and network disclosures.</p><p>拟公开页面：djs321.com/tab-butler/privacy-chrome 与 djs321.com/tab-butler/privacy-edge，目前尚未部署，不代表在线政策已生效。</p><p>Privacy contact: <a href="mailto:support@djs321.com">support@djs321.com</a></p>'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build()
