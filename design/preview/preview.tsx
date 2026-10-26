import React from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS, normalizeNavigationLayout } from '../../src/lib/settings'
import { db } from '../../src/lib/db'

const params = new URLSearchParams(location.search)
const screen = params.get('screen') || 'newtab'
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const width = params.get('width')
const height = params.get('height')
const section = params.get('section') || 'quicklinks'
const isFrame = params.has('frame')

if (!isFrame) {
  const frameParams = new URLSearchParams(params)
  frameParams.set('frame', '1')
  document.body.style.cssText = 'margin:0;background:#dbe3ec;font-family:-apple-system,sans-serif;'
  createRoot(document.getElementById('root')!).render(<>
    <div style={{ padding: '12px 20px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, background: '#fff', color: '#26354b' }}>
      <strong>本地预览 · 全部为可丢弃的测试数据</strong>
      <a href="?">新标签页</a><a href="?theme=dark">深色</a>
      <a href="?layout=sidebar">侧边导航</a><a href="?layout=sidebar&wallpaper=1&theme=dark">侧栏玻璃</a>
      <a href="?width=390">390px</a><a href="?width=768&theme=dark">768px 深色</a>
      <a href="?layout=sidebar&width=1280&height=480">矮窗口</a>
      <a href="?screen=popup&width=400">弹窗</a><a href="?screen=options&width=900">设置页</a>
      <a href="?wallpaper=1&theme=dark">壁纸模式</a><a href="?empty=1">空数据</a>
    </div>
    <iframe title="DJS321 Tabs 真实组件预览" src={`?${frameParams}`} style={{ display: 'block', width: width ? `${Number(width)}px` : '100%', maxWidth: '100%', height: height ? Number(height) : screen === 'popup' ? 620 : 'calc(100vh - 52px)', margin: '16px auto 0', border: 0, background: '#fff' }} />
  </>)
} else {
  const empty = params.has('empty')
  const names = ['项目调研', '设计参考', '开发资料']
  const fixtures = empty ? [] : Array.from({ length: 15 }, (_, i) => ({
    id: i + 1, title: i === 2 ? '这是一条很长的示例标题，用来核对卡片宽度、文本截断和操作按钮不会互相挤压 — Reference collection' : ['设计灵感', '周计划指南', 'Research notes', '项目资料', 'Reading list'][i % 5],
    url: `https://${['example.com', 'example.org', 'example.net'][i % 3]}/reference/${i}`,
    order: i, category: names[i % 3], prompt: i === 1 ? '示例提示词：整理本页的关键观点，下一次从这里继续。' : undefined,
  }))
  const tabs = fixtures.map(f => ({ id: f.id, title: f.title, url: f.url, windowId: f.id <= 10 ? 1 : 2, groupId: -1, lastAccessed: Date.now(), active: f.id === 1 }))
  const bookmarks = [{ id: '0', title: '', children: [{ id: '1', title: '书签栏', children: fixtures.slice(0, 8).map(f => ({ id: String(100 + f.id), parentId: '1', title: f.title, url: f.url })) }] }]
  const listeners = new Set<(changes: Record<string, unknown>) => void>()
  const navigationLayout = normalizeNavigationLayout(params.get('layout') ?? localStorage.getItem('tb_preview_navigationLayout'))
  const storage: Record<string, unknown> = { ...DEFAULT_SETTINGS, theme, defaultSection: section, navigationLayout }
  const store = {
    get(keys: unknown, cb?: (value: object) => void) { const result = typeof keys === 'object' && !Array.isArray(keys) ? { ...keys as object, ...storage } : { ...storage }; cb?.(result); return Promise.resolve(result) },
    set(value: Record<string, unknown>, cb?: () => void) { Object.assign(storage, value); if ('navigationLayout' in value) localStorage.setItem('tb_preview_navigationLayout', normalizeNavigationLayout(value.navigationLayout)); const changes = Object.fromEntries(Object.entries(value).map(([k, newValue]) => [k, { newValue }])); listeners.forEach(fn => fn(changes)); cb?.(); return Promise.resolve() },
    onChanged: { addListener(fn: (changes: Record<string, unknown>) => void) { listeners.add(fn) }, removeListener(fn: (changes: Record<string, unknown>) => void) { listeners.delete(fn) } },
  }
  const respond = <T,>(value: T, cb?: (result: T) => void) => { cb?.(value); return Promise.resolve(value) }
  const findNode = (id: string) => bookmarks[0].children.find(n => n.id === id)
  Object.assign(globalThis, { chrome: {
    storage: { sync: store, local: store },
    tabs: { query(q: { active?: boolean }, cb: (items: typeof tabs) => void) { return respond(q.active ? tabs.slice(0, 1) : tabs, cb) }, update() { return Promise.resolve() }, remove() { return Promise.resolve() }, create() { return Promise.resolve() }, sendMessage(_id: number, _message: unknown, cb?: (v: object) => void) { return respond({}, cb) } },
    windows: { update() { return Promise.resolve() } },
    tabGroups: { get() { return Promise.resolve({ title: '示例分组', color: 'blue' }) } },
    bookmarks: { getTree(cb: (v: typeof bookmarks) => void) { return respond(bookmarks, cb) }, getSubTree(id: string, cb: (v: object[]) => void) { return respond(findNode(id) ? [findNode(id)!] : [], cb) }, search(q: string, cb: (v: object[]) => void) { return respond(bookmarks[0].children[0].children.filter(n => `${n.title} ${n.url}`.toLowerCase().includes(q.toLowerCase())), cb) } },
    runtime: { sendMessage() { return Promise.resolve({ ok: true }) }, openOptionsPage() {}, getURL(p: string) { return p } },
    downloads: { download() {} },
  } })
  // This sandbox never sends content to an App or to a remote quote service.
  window.fetch = async () => new Response(JSON.stringify({ error: '预览不发送实际数据', hitokoto: '把注意力留给真正重要的事。' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  localStorage.setItem('ql_layout', 'list2')
  localStorage.setItem('tb_popup_theme', theme)
  localStorage.removeItem('tb_wallpaper')
  if (params.has('wallpaper')) {
    const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200">
      <defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#4d879b"/><stop offset=".5" stop-color="#d9bf96"/><stop offset="1" stop-color="#404761"/></linearGradient>
        <pattern id="lines" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M0 0h64v64" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="2"/></pattern></defs>
      <path fill="url(#g)" d="M0 0h1800v1200H0z"/><circle cx="350" cy="180" r="270" fill="#77bdc6"/><circle cx="1440" cy="780" r="370" fill="#e29a69"/>
      <path fill="url(#lines)" d="M0 0h1800v1200H0z"/>
    </svg>`
    localStorage.setItem('tb_wallpaper', `data:image/svg+xml;base64,${btoa(wallpaper)}`)
    localStorage.setItem('tb_wallpaperBlur', '0')
    localStorage.setItem('tb_wallpaperDim', '0.1')
  }
  await db.transaction('rw', db.quickLinks, db.archived, db.undo, async () => {
    await db.quickLinks.clear(); await db.archived.clear(); await db.undo.clear()
    await db.quickLinks.bulkAdd(fixtures)
    if (!empty) await db.archived.bulkAdd(fixtures.slice(0, 3).map(f => ({ url: f.url, title: f.title, archivedAt: new Date(Date.now() - 3600000), group: '示例归档' })))
  })
  const root = createRoot(document.getElementById('root')!)
  if (screen === 'popup') {
    await import('../../src/popup/App.css')
    const { default: App } = await import('../../src/popup/App')
    root.render(<App />)
  } else if (screen === 'options') {
    await import('../../src/options/Options.css')
    const { default: Options } = await import('../../src/options/Options')
    root.render(<Options />)
  } else {
    await import('../../src/newtab/NewTab.css')
    const { default: NewTab } = await import('../../src/newtab/NewTab')
    root.render(<NewTab />)
  }
}
