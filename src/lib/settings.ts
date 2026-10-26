export type GroupBy = 'none' | 'domain' | 'chromeGroup' | 'window' | 'time' | 'category'
export type ViewMode = 'grid' | 'list' | 'kanban'
export type Theme = 'light' | 'dark'
export type NavSection = 'tabs' | 'quicklinks' | 'bookmarks'
export type NavigationLayout = 'top' | 'sidebar' | 'classic'

export interface Settings {
  groupBy: GroupBy
  viewMode: ViewMode
  theme: Theme
  navigationLayout: NavigationLayout
  defaultSection: NavSection
  navOrder: NavSection[]
  wallpaper: string      // 背景图 URL（空字符串=无壁纸）
  wallpaperBlur: number  // 模糊度 0~20px
  wallpaperDim: number   // 遮罩不透明度 0~0.8
  justdoitApiUrl: string // JustDoIt 桌面端地址（默认 http://localhost:37373），可在设置页改
  enableRemoteQuotes: boolean
}

export const DEFAULT_JUSTDOIT_API_URL = 'http://localhost:37373'

export const DEFAULT_SETTINGS: Settings = {
  groupBy: 'domain',
  viewMode: 'grid',
  theme: 'light',
  navigationLayout: 'top',
  defaultSection: 'tabs',
  navOrder: ['tabs', 'quicklinks', 'bookmarks'],
  wallpaper: '',
  wallpaperBlur: 4,
  wallpaperDim: 0.3,
  justdoitApiUrl: DEFAULT_JUSTDOIT_API_URL,
  enableRemoteQuotes: false,
}

export function normalizeNavigationLayout(value: unknown): NavigationLayout {
  return value === 'sidebar' || value === 'classic' ? value : 'top'
}

/** 规范化 JustDoIt 端点：去空白、去尾部斜杠；非法/空则回退默认。纯函数，可测。 */
export function normalizeApiUrl(url: string | undefined | null): string {
  const v = String(url ?? '').trim().replace(/\/+$/, '')
  if (!v) return DEFAULT_JUSTDOIT_API_URL
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return DEFAULT_JUSTDOIT_API_URL
    if (u.hostname.includes('*') || u.username || u.password || u.search || u.hash) return DEFAULT_JUSTDOIT_API_URL
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return DEFAULT_JUSTDOIT_API_URL
    return v
  } catch {
    return DEFAULT_JUSTDOIT_API_URL
  }
}

/**
 * 仅从 chrome.storage.sync 读取 JustDoIt 端点（不碰 localStorage）。
 * sendToJustDoIt 会在 background service worker 调用，那里没有 localStorage，故不能用 loadSettings。
 */
export function getJustDoItApiUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get({ justdoitApiUrl: DEFAULT_JUSTDOIT_API_URL }, r => {
      const error = chrome.runtime?.lastError
      if (error) { reject(new Error(error.message)); return }
      const raw = String(r.justdoitApiUrl ?? '').trim().replace(/\/+$/, '')
      const normalized = normalizeApiUrl(raw)
      if (raw && normalized !== raw) reject(new Error('连接地址无效；仅支持本机 HTTP 或无密码、无查询参数的 HTTPS 地址。'))
      else resolve(normalized)
    })
  })
}

export function loadSettings(): Promise<Settings> {
  return new Promise(resolve =>
    chrome.storage.sync.get(
      {
        groupBy: DEFAULT_SETTINGS.groupBy,
        viewMode: DEFAULT_SETTINGS.viewMode,
        theme: DEFAULT_SETTINGS.theme,
        navigationLayout: DEFAULT_SETTINGS.navigationLayout,
        defaultSection: DEFAULT_SETTINGS.defaultSection,
        navOrder: DEFAULT_SETTINGS.navOrder,
        justdoitApiUrl: DEFAULT_SETTINGS.justdoitApiUrl,
        enableRemoteQuotes: DEFAULT_SETTINGS.enableRemoteQuotes,
      },
      r => {
        // wallpaper 相关字段用 localStorage 存（避免超 sync 8KB 限制）
        const wallpaper     = localStorage.getItem('tb_wallpaper')    ?? DEFAULT_SETTINGS.wallpaper
        const wallpaperBlur = Number(localStorage.getItem('tb_wallpaperBlur') ?? DEFAULT_SETTINGS.wallpaperBlur)
        const wallpaperDim  = Number(localStorage.getItem('tb_wallpaperDim')  ?? DEFAULT_SETTINGS.wallpaperDim)
        const loaded = r as Pick<Settings, 'groupBy' | 'viewMode' | 'theme' | 'navigationLayout' | 'defaultSection' | 'navOrder' | 'justdoitApiUrl' | 'enableRemoteQuotes'>
        const navOrder = Array.isArray(loaded.navOrder)
          ? loaded.navOrder.filter((item): item is NavSection => ['tabs', 'quicklinks', 'bookmarks'].includes(item))
          : []
        resolve({
          ...loaded,
          navigationLayout: normalizeNavigationLayout(loaded.navigationLayout),
          enableRemoteQuotes: loaded.enableRemoteQuotes === true,
          navOrder: navOrder.length > 0 ? navOrder : DEFAULT_SETTINGS.navOrder,
          wallpaper,
          wallpaperBlur,
          wallpaperDim,
        })
      }
    )
  )
}

export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  if (key === 'wallpaper' || key === 'wallpaperBlur' || key === 'wallpaperDim') {
    localStorage.setItem(`tb_${key}`, String(value))
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => chrome.storage.sync.set({ [key]: value }, () => {
    const error = chrome.runtime?.lastError
    if (error) reject(new Error(error.message || '保存设置失败。'))
    else resolve()
  }))
}
