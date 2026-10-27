import { createElement, useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { errMsg } from '../lib/errors'
import { brandName } from '../lib/brand'
import { GROUP_ICONS, VIEW_ICONS } from '../lib/choice-icons'
import type { SVGProps } from 'react'
import { db } from '../lib/db'
import { ArchivedTab } from '../types'
import { Settings, DEFAULT_SETTINGS, loadSettings, saveSetting, normalizeNavigationLayout, GroupBy, ViewMode, NavSection } from '../lib/settings'
import { sendToJustDoIt, extractMarkdownFromTab } from '../lib/justdoit'
import { requestCaptureAccess } from '../lib/site-access'
import { parseBackup, replaceBackupCollections } from '../lib/backup'
import { groupTabs, TabGroup } from './groupers'
import { GridView } from './views/GridView'
import { ListView } from './views/ListView'
import { KanbanView } from './views/KanbanView'
import { QuickLinksView } from './views/QuickLinksView'
import { BookmarksView } from './views/BookmarksView'
import { SkinPanel } from './views/SkinPanel'
import { SettingsModal } from './views/SettingsModal'
import { Dialog } from './views/Dialog'
import { resolveSearchUrl } from '../lib/search'
import { observeBrowserTabs } from '../lib/page-url'
import { requestTabAction, requestUndoActions } from '../lib/tab-actions'
import { t, plural, uiLocale } from '../lib/i18n'
import { categoryLabel, DEFAULT_CATEGORY_ID } from '../lib/page-category'

// ==========================================
// Heroicons 风格 SVG 图标集（stroke 线性，颜色随 currentColor）
// ==========================================
const S = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const IC = (p: SVGProps<SVGSVGElement>) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...S} {...p} />

// 标签页——层叠方块
const IconTabs = () => <IC>
  <rect x="2" y="9" width="20" height="12" rx="2"/>
  <path d="M2 9V7a2 2 0 012-2h4l2 2.5h10a2 2 0 012 2V9"/>
  <line x1="7" y1="13" x2="17" y2="13"/>
  <line x1="7" y1="17" x2="13" y2="17"/>
</IC>

// 导航——指南针
const IconCompass = () => <IC>
  <circle cx="12" cy="12" r="9.5"/>
  <polygon points="16.12,7.88 13.5,13.5 7.88,16.12 10.5,10.5" fill="currentColor" stroke="none" opacity="0.3"/>
  <polyline points="16.12,7.88 13.5,13.5 7.88,16.12 10.5,10.5 16.12,7.88"/>
</IC>

// 书签
const IconBookmark = () => <IC>
  <path d="M5 3h14a1 1 0 011 1v17l-8-4-8 4V4a1 1 0 011-1z"/>
  <line x1="9" y1="8" x2="15" y2="8"/>
</IC>

// 调色盘
const IconPalette = () => <IC>
  <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10a2 2 0 002-2c0-.53-.19-1-.5-1.38-.31-.38-.5-.87-.5-1.38 0-1.1.9-2 2-2h2.38A5.62 5.62 0 0022 9.62C22 5.4 17.52 2 12 2z"/>
  <circle cx="7" cy="10" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="10" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="14" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
  <circle cx="17" cy="10" r="1.2" fill="currentColor" stroke="none"/>
</IC>

// 太阳
const IconSun = () => <IC>
  <circle cx="12" cy="12" r="4"/>
  <line x1="12" y1="2" x2="12" y2="5"/>
  <line x1="12" y1="19" x2="12" y2="22"/>
  <line x1="2" y1="12" x2="5" y2="12"/>
  <line x1="19" y1="12" x2="22" y2="12"/>
  <line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/>
  <line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/>
  <line x1="19.07" y1="4.93" x2="16.95" y2="7.05"/>
  <line x1="7.05" y1="16.95" x2="4.93" y2="19.07"/>
</IC>

// 月亮
const IconMoon = () => <IC>
  <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/>
</IC>

// 齿轮
const IconSettings = () => <IC>
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
</IC>


// 星期、月份名交给 Intl 按界面语言生成（zh-CN 下仍是「星期一」「十月」）
function formatClockDate(date: Date) {
  const locale = uiLocale()
  return t('newtab_date', {
    weekday: date.toLocaleDateString(locale, { weekday: 'long' }),
    month: date.toLocaleDateString(locale, { month: 'long' }),
    day: date.getDate(),
  })
}

const GROUP_SHORTCUTS: { value: GroupBy; label: string }[] = [
  { value: 'none',        label: t('newtab_groupAll') },
  { value: 'domain',      label: t('newtab_groupDomain') },
  { value: 'chromeGroup', label: t('newtab_groupChromeGroup') },
  { value: 'window',      label: t('newtab_groupWindow') },
  { value: 'time',        label: t('newtab_groupTime') },
  { value: 'category',    label: t('newtab_groupCategory') },
]

const VIEW_SHORTCUTS: { value: ViewMode; label: string }[] = [
  { value: 'grid',   label: t('newtab_viewGrid') },
  { value: 'list',   label: t('newtab_viewList') },
  { value: 'kanban', label: t('newtab_viewKanban') },
]

const NAV_ITEMS: Array<{
  key: NavSection
  icon: JSX.Element
  label: string
  activeColor: string
  activeBg: string
  activeBorder: string
}> = [
  {
    key: 'tabs',
    icon: <IconTabs />,
    label: t('newtab_navTabs'),
    activeColor: '#3b82f6',
    activeBg: 'rgba(59,130,246,0.13)',
    activeBorder: 'rgba(59,130,246,0.35)',
  },
  {
    key: 'quicklinks',
    icon: <IconCompass />,
    label: t('newtab_navQuicklinks'),
    activeColor: '#10b981',
    activeBg: 'rgba(16,185,129,0.13)',
    activeBorder: 'rgba(16,185,129,0.35)',
  },
  {
    key: 'bookmarks',
    icon: <IconBookmark />,
    label: t('newtab_navBookmarks'),
    activeColor: '#f59e0b',
    activeBg: 'rgba(245,158,11,0.13)',
    activeBorder: 'rgba(245,158,11,0.35)',
  },
]

function sortNavItems(navOrder: NavSection[]) {
  const sourceOrder = navOrder.length > 0 ? navOrder : DEFAULT_SETTINGS.navOrder
  const orderMap = new Map(sourceOrder.map((key, index) => [key, index]))
  return [...NAV_ITEMS].sort((a, b) => {
    const aIndex = orderMap.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderMap.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })
}

// --- Custom Brand Vectors ---
const GoogleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)
const PerplexityIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M10 1h4v22h-4z M1 10h22v4h-22z M3 3h5v5H3z M16 3h5v5h-5z M3 16h5v5H3z M16 16h5v5h-5z" />
  </svg>
)
const GithubIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
)
const BingIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M1.5 1.5h9v9h-9zM13.5 1.5h9v9h-9zM1.5 13.5h9v9h-9zM13.5 13.5h9v9h-9z" /></svg>
)
const BaiduIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M9.154 0C7.71 0 6.54 1.658 6.54 3.707c0 2.051 1.171 3.71 2.615 3.71 1.446 0 2.614-1.659 2.614-3.71C11.768 1.658 10.6 0 9.154 0zm7.025.594C14.86.58 13.347 2.589 13.2 3.927c-.187 1.745.25 3.487 2.179 3.735 1.933.25 3.175-1.806 3.422-3.364.252-1.555-.995-3.364-2.362-3.674a1.218 1.218 0 0 0-.261-.03zM3.582 5.535a2.811 2.811 0 0 0-.156.008c-2.118.19-2.428 3.24-2.428 3.24-.287 1.41.686 4.425 3.297 3.864 2.617-.561 2.262-3.68 2.183-4.362-.125-1.018-1.292-2.773-2.896-2.75zm16.534 1.753c-2.308 0-2.617 2.119-2.617 3.616 0 1.43.121 3.425 2.988 3.362 2.867-.063 2.553-3.238 2.553-3.988 0-.745-.62-2.99-2.924-2.99zm-8.264 2.478c-1.424.014-2.708.925-3.323 1.947-1.118 1.868-2.863 3.05-3.112 3.363-.25.309-3.61 2.116-2.864 5.42.746 3.301 3.365 3.237 3.365 3.237s1.93.19 4.171-.31c2.24-.495 4.17.123 4.17.123s5.233 1.748 6.665-1.616c1.43-3.364-.808-5.109-.808-5.109s-2.99-2.306-4.736-4.798c-1.072-1.665-2.348-2.268-3.528-2.257zm-2.234 3.84l1.542.024v8.197H7.758c-1.47-.291-2.055-1.292-2.13-1.462-.072-.173-.488-.976-.268-2.343.635-2.049 2.447-2.196 2.447-2.196h1.81zm3.964 2.39v3.881c.096.413.612.488.612.488h1.614v-4.343h1.689v5.782h-3.915c-1.517-.39-1.59-1.465-1.59-1.465v-4.317zm-5.458 1.147c-.66.197-.978.708-1.05.928-.076.22-.247.78-.1 1.269.294 1.095 1.248 1.144 1.248 1.144h1.37v-3.34z" />
  </svg>
)

const ENGINES = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: GoogleIcon },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/?q=', icon: PerplexityIcon },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=', icon: GithubIcon },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=', icon: BingIcon },
  { id: 'baidu', name: 'Baidu', url: 'https://www.baidu.com/s?wd=', icon: BaiduIcon }
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6)  return t('newtab_greetingNight')
  if (h < 11) return t('newtab_greetingMorning')
  if (h < 14) return t('newtab_greetingNoon')
  if (h < 18) return t('newtab_greetingAfternoon')
  if (h < 22) return t('newtab_greetingEvening')
  return t('newtab_greetingNight')
}

export default function NewTab() {
  // ── 设置（从 chrome.storage.sync 读取，监听实时变更）
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings]         = useState(false)
  const [showSkin, setShowSkin]                 = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // 包装 saveSetting，同时更新本地 state（wallpaper 字段不走 chrome.storage）
  const saveSettingAndSync = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    void saveSetting(key, value).then(() => setSettings(prev => ({ ...prev, [key]: value })))
      .catch(error => showToast(t('newtab_settingsNotSaved', { error: String(errMsg(error)) })))
  }
  useEffect(() => {
    loadSettings().then(setSettings)
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      setSettings(prev => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(changes)) {
          if (k in next) (next as Record<string, unknown>)[k] = v.newValue
        }
        next.navigationLayout = normalizeNavigationLayout(next.navigationLayout)
        next.enableRemoteQuotes = next.enableRemoteQuotes === true
        return next
      })
    }
    chrome.storage.sync.onChanged.addListener(handler)
    return () => chrome.storage.sync.onChanged.removeListener(handler)
  }, [])

  useEffect(() => {
    setActiveSection(settings.defaultSection)
  }, [settings.defaultSection])

  // ── 时钟
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const timeStr = time.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = formatClockDate(time)

  // ── 壁纸模式：通过 JS 覆盖 .nt-root 上的 CSS 变量
  // 重要：变量定义在 .nt-root class 上，必须注入到 .nt-root 元素的 inline style 才能覆盖
  useEffect(() => {
    // 等 React 渲染后再查找元素
    const applyVars = () => {
      const ntRoot = document.querySelector('.nt-root') as HTMLElement | null
      if (!ntRoot) return

      // 壁纸模式下会被覆盖的表面/文字 token；浅色壁纸或关闭壁纸时移除，回落到主题默认值
      const SURFACE_PROPS = [
        '--card-bg', '--card-hover-bg', '--card-border', '--card-hover-bd',
        '--card-title', '--card-url', '--card-close', '--card-close-hbg', '--card-close-hc', '--card-favicon-ph',
        '--dh-bg', '--dh-hover', '--dh-bd', '--dh-name', '--chevron',
        '--text-primary', '--text-date', '--text-greeting', '--section-title',
        '--cnt-bg', '--cnt-c', '--list-row-hover', '--list-sep',
        '--arch-hover', '--arch-dot', '--arch-title', '--arch-date',
        '--search-bg', '--search-border', '--search-color', '--search-ph', '--search-icon',
        '--search-focus-bg', '--search-focus-bd', '--search-focus-sh',
        '--kb-col-bg', '--kb-col-bd', '--kb-card-bg', '--kb-card-bd', '--kb-card-hbg', '--kb-hdr-c',
        '--bg-hover',
        '--bg-card-solid', '--lg-fill', '--lg-fill-thin', '--lg-stroke', '--lg-stroke-soft', '--text-muted',
      ]

      if (!settings.wallpaper) {
        // 无壁纸：清除所有覆盖，回落到 .nt-root[.dark] 主题默认值
        document.documentElement.style.background = ''
        document.body.style.background = ''
        ntRoot.style.removeProperty('--bg')
        SURFACE_PROPS.forEach(p => ntRoot.style.removeProperty(p))
        return
      }

      // 有壁纸：html/body 透明让壁纸透出（两主题都需）
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      ntRoot.style.setProperty('--bg', 'transparent')

      if (settings.theme !== 'dark') {
        // 浅色主题 + 壁纸：保留浅色磨砂面 + 深色文字（贴合设计图）；清掉深色覆盖残留。
        // 悬浮在壁纸上的时钟/搜索等仍由 .has-wallpaper CSS 保持白字+阴影（不分主题）。
        SURFACE_PROPS.forEach(p => ntRoot.style.removeProperty(p))
      } else {
        // 深色主题 + 壁纸：深色磨砂面 + 白字（任何壁纸都可读）
        // 卡片——深色半透明底色（任何壁纸都可读）
        ntRoot.style.setProperty('--card-bg',       'rgba(8, 8, 20, 0.80)')
        ntRoot.style.setProperty('--card-hover-bg',  'rgba(8, 8, 20, 0.92)')
        ntRoot.style.setProperty('--card-border',    'rgba(255,255,255,0.20)')
        ntRoot.style.setProperty('--card-hover-bd',  'rgba(255,255,255,0.32)')
        ntRoot.style.setProperty('--card-title',     '#ffffff')
        ntRoot.style.setProperty('--card-url',       'rgba(255,255,255,0.60)')
        ntRoot.style.setProperty('--card-close',     'rgba(255,255,255,0.55)')
        ntRoot.style.setProperty('--card-close-hbg', 'rgba(255,80,80,0.30)')
        ntRoot.style.setProperty('--card-close-hc',  '#ff8080')
        ntRoot.style.setProperty('--card-favicon-ph','rgba(255,255,255,0.15)')

        // 分组头——深色半透明
        ntRoot.style.setProperty('--dh-bg',    'rgba(0,0,0,0.58)')
        ntRoot.style.setProperty('--dh-hover', 'rgba(0,0,0,0.72)')
        ntRoot.style.setProperty('--dh-bd',    'rgba(255,255,255,0.20)')
        ntRoot.style.setProperty('--dh-name',  '#ffffff')
        ntRoot.style.setProperty('--chevron',  'rgba(255,255,255,0.65)')

        // 文字——全面白色
        ntRoot.style.setProperty('--text-primary',  '#ffffff')
        ntRoot.style.setProperty('--text-date',     'rgba(255,255,255,0.82)')
        ntRoot.style.setProperty('--text-greeting', 'rgba(255,255,255,0.72)')
        ntRoot.style.setProperty('--section-title', 'rgba(255,255,255,0.70)')

        // 标记数量
        ntRoot.style.setProperty('--cnt-bg', 'rgba(255,255,255,0.20)')
        ntRoot.style.setProperty('--cnt-c',  '#ffffff')

        // 列表
        ntRoot.style.setProperty('--list-row-hover', 'rgba(255,255,255,0.10)')
        ntRoot.style.setProperty('--list-sep',        'rgba(255,255,255,0.30)')

        // 归档
        ntRoot.style.setProperty('--arch-hover', 'rgba(255,255,255,0.10)')
        ntRoot.style.setProperty('--arch-dot',   'rgba(255,255,255,0.50)')
        ntRoot.style.setProperty('--arch-title', 'rgba(255,255,255,0.92)')
        ntRoot.style.setProperty('--arch-date',  'rgba(255,255,255,0.52)')

        // 搜索框（注意变量名和 CSS 中一致）
        ntRoot.style.setProperty('--search-bg',       'rgba(255,255,255,0.20)')
        ntRoot.style.setProperty('--search-border',   'rgba(255,255,255,0.35)')
        ntRoot.style.setProperty('--search-color',    '#ffffff')
        ntRoot.style.setProperty('--search-ph',       'rgba(255,255,255,0.50)')
        ntRoot.style.setProperty('--search-icon',     'rgba(255,255,255,0.72)')
        ntRoot.style.setProperty('--search-focus-bg', 'rgba(8,8,24,0.88)')
        ntRoot.style.setProperty('--search-focus-bd', 'rgba(255,255,255,0.40)')
        ntRoot.style.setProperty('--search-focus-sh', 'rgba(0,0,0,0.50)')

        // 看板列
        ntRoot.style.setProperty('--kb-col-bg',   'rgba(0,0,0,0.45)')
        ntRoot.style.setProperty('--kb-col-bd',   'rgba(255,255,255,0.16)')
        ntRoot.style.setProperty('--kb-card-bg',  'rgba(8,8,20,0.80)')
        ntRoot.style.setProperty('--kb-card-bd',  'rgba(255,255,255,0.16)')
        ntRoot.style.setProperty('--kb-card-hbg', 'rgba(8,8,20,0.92)')
        ntRoot.style.setProperty('--kb-hdr-c',    '#ffffff')

        // 背景 / 主容器
        ntRoot.style.setProperty('--bg',       'transparent')
        ntRoot.style.setProperty('--bg-hover', 'rgba(255,255,255,0.10)')

        // DS / Liquid Glass 令牌——书签(BookmarksView)/导航(QuickLinksView) 直接吃这套；
        // 默认是浅色近白底，壁纸下若不覆盖会与强制白字撞成「白底白字」看不清。
        ntRoot.style.setProperty('--bg-card-solid',  'rgba(12,12,24,0.92)')
        ntRoot.style.setProperty('--lg-fill',        'rgba(8,8,20,0.80)')
        ntRoot.style.setProperty('--lg-fill-thin',   'rgba(255,255,255,0.08)')
        ntRoot.style.setProperty('--lg-stroke',      'rgba(255,255,255,0.20)')
        ntRoot.style.setProperty('--lg-stroke-soft', 'rgba(255,255,255,0.12)')
        ntRoot.style.setProperty('--text-muted',     'rgba(255,255,255,0.62)')
      }
    }

    // 首次渲染后立即执行，随后 wallpaper 或主题变化时执行
    applyVars()
  }, [settings.wallpaper, settings.theme])

  // ── 搜索引擎配置 ──
  const [engineIdx, setEngineIdx] = useState(0)
  useEffect(() => {
    const saved = localStorage.getItem('tab_butler_engine_idx')
    if (saved) {
      const idx = parseInt(saved, 10)
      if (!Number.isNaN(idx) && idx >= 0 && idx < ENGINES.length) {
        setEngineIdx(idx)
      }
    }
  }, [])
  const currentEngine = ENGINES[engineIdx]
  const EngineIcon = currentEngine.icon

  const cycleEngine = () => {
    const nextIdx = (engineIdx + 1) % ENGINES.length
    setEngineIdx(nextIdx)
    localStorage.setItem('tab_butler_engine_idx', String(nextIdx))
  }

  // ── 搜索
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus() }, [])
  const handleSearch = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const url = resolveSearchUrl(query, currentEngine.url)
      if (url) window.location.href = url
    }
  }, [query, currentEngine.url])

  // ── 打开的 Tab
  const [openTabs, setOpenTabs] = useState<chrome.tabs.Tab[]>([])
  useEffect(() => observeBrowserTabs<chrome.tabs.Tab>(
    callback => chrome.tabs.query({}, callback),
    [chrome.tabs.onCreated, chrome.tabs.onUpdated, chrome.tabs.onRemoved,
      chrome.tabs.onActivated, chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached],
    setOpenTabs,
  ), [])

  // ── 归档
  const [archived, setArchived] = useState<ArchivedTab[]>([])
  useEffect(() => {
    db.archived.orderBy('archivedAt').reverse().limit(8).toArray().then(setArchived)
  }, [])

  // ── 主入口状态 (tabs | quicklinks | bookmarks)
  const [activeSection, setActiveSection] = useState<NavSection>(DEFAULT_SETTINGS.defaultSection)
  const [draggingNav, setDraggingNav] = useState<NavSection | null>(null)
  const [dropNavTarget, setDropNavTarget] = useState<NavSection | null>(null)
  const dragNavKeyRef = useRef<NavSection | null>(null)

  // ── 分组（groupBy 或 query 变化时重新计算）
  const [groups, setGroups] = useState<TabGroup[]>([])
  const filteredTabs = useMemo(() => {
    if (!query) return openTabs
    const lower = query.toLowerCase()
    const isDomain = lower.startsWith('domain:')
    const isRegex = lower.startsWith('/') && lower.endsWith('/') && lower.length > 2
    let regex: RegExp | null = null
    if (isRegex) {
      try { regex = new RegExp(query.slice(1, -1), 'i') } catch (e) {}
    }

    return openTabs.filter(t => {
      if (isRegex && regex) return regex.test(t.title || '') || regex.test(t.url || '')
      if (isDomain) {
        const domainQuery = lower.slice(7).trim()
        try {
          return new URL(t.url || '').hostname.toLowerCase().includes(domainQuery)
        } catch { return false }
      }
      return t.title?.toLowerCase().includes(lower) || t.url?.toLowerCase().includes(lower)
    })
  }, [openTabs, query])

  useEffect(() => {
    groupTabs(filteredTabs, settings.groupBy).then(setGroups)
  }, [filteredTabs, settings.groupBy])

  const filteredArchived = useMemo(() =>
    archived.filter(t => !query ||
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.url.toLowerCase().includes(query.toLowerCase())
    ), [archived, query])

  // ── 书签搜索
  const [searchedBookmarks, setSearchedBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  
  // ── 快捷添加到导航状态
  const [quicklinkingTab, setQuicklinkingTab] = useState<chrome.tabs.Tab | null>(null)
  const [qlCategory, setQlCategory] = useState<string>('')
  const [availableCategories, setAvailableCategories] = useState<string[]>([])
  
  // 书签夹选择状态
  const [bookmarkingTab, setBookmarkingTab] = useState<chrome.tabs.Tab | null>(null)
  const [bookmarkTree, setBookmarkTree] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  
  useEffect(() => {
    if (!query) {
      setSearchedBookmarks([])
      return
    }
    if (chrome.bookmarks) {
      chrome.bookmarks.search(query, (results) => {
        setSearchedBookmarks(results.filter(b => b.url).slice(0, 10)) // 限制最多展示 10 条书签
      })
    }
  }, [query])

  // ── 每日一言
  const [dailyQuote, setDailyQuote] = useState('')
  useEffect(() => {
    setDailyQuote('')
    if (!settings.enableRemoteQuotes) return
    const controller = new AbortController()
    fetch('https://v1.hitokoto.cn/?c=f&c=d', { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!controller.signal.aborted && d?.hitokoto) setDailyQuote(`「${d.hitokoto}」`) })
      .catch(() => {})
    return () => controller.abort()
  }, [settings.enableRemoteQuotes])

  // ── 折叠状态
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const toggleCollapse = (id: string) =>
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // ── 框选与多选逻辑 ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.tab-card') || target.closest('.list-row') || target.closest('.kanban-card') || target.closest('.nt-toolbar') || target.closest('.nt-sticky-top') || target.closest('.nt-dialog') || target.closest('button')) {
      return
    }
    setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectionBox) return
    setSelectionBox({ ...selectionBox, currentX: e.clientX, currentY: e.clientY })
  }

  const handleMouseUp = () => {
    if (!selectionBox) return
    const { startX, startY, currentX, currentY } = selectionBox
    const rect = {
      left: Math.min(startX, currentX),
      right: Math.max(startX, currentX),
      top: Math.min(startY, currentY),
      bottom: Math.max(startY, currentY)
    }

    if (rect.right - rect.left > 5 && rect.bottom - rect.top > 5) {
      const cards = document.querySelectorAll('[data-tab-id]')
      const newSelected = new Set(selectedIds)
      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const isIntersecting = !(
          rect.right < cardRect.left || 
          rect.left > cardRect.right || 
          rect.bottom < cardRect.top || 
          rect.top > cardRect.bottom
        )
        if (isIntersecting) {
          const id = Number(card.getAttribute('data-tab-id'))
          if (!isNaN(id)) newSelected.add(id)
        }
      })
      setSelectedIds(newSelected)
    }
    setSelectionBox(null)
  }

  // ── 操作 ──
  function switchToTab(tab: chrome.tabs.Tab) {
    if (selectedIds.size > 0 && tab.id) {
      const next = new Set(selectedIds)
      if (next.has(tab.id)) next.delete(tab.id)
      else next.add(tab.id)
      setSelectedIds(next)
      return
    }
    if (tab.id) chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true })
  }
  async function closeTab(e: React.MouseEvent, tab: chrome.tabs.Tab) {
    e.stopPropagation()
    if (tab.id != null) {
      try {
        const result = await requestTabAction({ type: 'CLOSE_AND_ARCHIVE', tabId: tab.id })
        setOpenTabs(prev => prev.filter(t => t.id !== tab.id))
        setSelectedIds(prev => { const n = new Set(prev); n.delete(tab.id!); return n })
        showToast(t('newtab_archivedTab', { title: tab.title ?? '' }), () => { void restoreTabs(result.undoIds || []) })
      } catch (error) {
        showToast(t('newtab_archiveFailed', { error: String(errMsg(error)) }))
      }
    }
  }
  async function restoreTabs(undoIds: number[]) {
    if (undoPending.current) return
    undoPending.current = true
    setUndoBusy(true)
    try {
      await requestUndoActions(undoIds)
      showToast(t('newtab_restored'))
    } catch (error) {
      showToast(t('newtab_restoreFailed', { error: String(errMsg(error)) }))
    } finally {
      undoPending.current = false
      setUndoBusy(false)
    }
  }
  function reopenArchived(tab: ArchivedTab) { chrome.tabs.create({ url: tab.url }) }
  function formatDate(date: Date) {
    const diff = Date.now() - new Date(date).getTime()
    if (diff < 3600000)   return plural('newtab_minutesAgo_one', 'newtab_minutesAgo_other', Math.floor(diff / 60000))
    if (diff < 86400000)  return plural('newtab_hoursAgo_one', 'newtab_hoursAgo_other', Math.floor(diff / 3600000))
    return plural('newtab_daysAgo_one', 'newtab_daysAgo_other', Math.floor(diff / 86400000))
  }

  // ── Toast 通知与撤销
  const [toast, setToast] = useState('')
  const [undoAction, setUndoAction] = useState<(() => void) | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const undoPending = useRef(false)
  const showToast = (msg: string, undo?: () => void) => {
    setToast(msg)
    setUndoAction(() => undo || null)
    setTimeout(() => {
      setToast(prev => prev === msg ? '' : prev)
      setUndoAction(null)
    }, undo ? 6000 : 3000)
  }

  // ── JustDoIt 推送
  async function handleSendToJustDoIt(e: React.MouseEvent, tab: chrome.tabs.Tab) {
    e.stopPropagation()
    try {
      await requestCaptureAccess([tab.url || ''])
      const content = tab.id ? await extractMarkdownFromTab(tab.id, tab.url) : undefined
      await sendToJustDoIt({ title: tab.title || 'Untitled', url: tab.url || '', content })
      showToast(t('newtab_sentToInbox'))
    } catch (err) {
      showToast(t('newtab_errorToast', { error: errMsg(err) ?? t('common_unknownError') }))
    }
  }

  // ── 批量操作
  async function handleBatchSend() {
    const tabsToPush = openTabs.filter(t => t.id && selectedIds.has(t.id))
    if (tabsToPush.length === 0) return
    
    try {
      await requestCaptureAccess(tabsToPush.map(tab => tab.url || ''))
      showToast(plural('newtab_batchSending_one', 'newtab_batchSending_other', tabsToPush.length))
      const payloads = []
      for (const tab of tabsToPush) {
        const content = tab.id ? await extractMarkdownFromTab(tab.id, tab.url) : undefined
        payloads.push({ title: tab.title || 'Untitled', url: tab.url || '', content })
      }
      await sendToJustDoIt(payloads)
      showToast(plural('newtab_batchSent_one', 'newtab_batchSent_other', payloads.length))
      setSelectedIds(new Set())
    } catch (err) {
      showToast(t('newtab_errorToast', { error: errMsg(err) ?? t('common_unknownError') }))
    }
  }

  async function handleBatchClose() {
    const tabsToClose = openTabs.filter(t => t.id && selectedIds.has(t.id))
    if (tabsToClose.length === 0) return
    
    const undoIds: number[] = []
    let closed = 0
    try {
      for (const tab of tabsToClose) {
        const result = await requestTabAction({ type: 'CLOSE_AND_ARCHIVE', tabId: tab.id })
        undoIds.push(...(result.undoIds || []))
        closed++
        setOpenTabs(prev => prev.filter(item => item.id !== tab.id))
        setSelectedIds(prev => { const next = new Set(prev); next.delete(tab.id!); return next })
      }
      showToast(plural('newtab_batchArchived_one', 'newtab_batchArchived_other', closed), () => { void restoreTabs(undoIds) })
    } catch (error) {
      showToast(t('newtab_batchArchivePartial', { closed, total: tabsToClose.length, error: String(errMsg(error)) }),
        undoIds.length ? () => { void restoreTabs(undoIds) } : undefined)
    }
  }

  // ── 兜底云同步：导入与导出备份 ──
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExportData() {
    try {
      const quickLinks = await db.quickLinks.toArray()
      const archived = await db.archived.toArray()
      const undo = await db.undo.toArray()
      
      const backup = {
        version: 1,
        timestamp: new Date().toISOString(),
        settings,
        data: { quickLinks, archived, undo }
      }
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `djs321-tabs-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('newtab_exported'))
    } catch (err) {
      showToast(t('newtab_exportFailed', { error: errMsg(err) ?? t('common_unknownError') }))
    }
  }

  async function handleImportData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error(t('newtab_backupTooLarge'))
      const backup = parseBackup(await file.text())
      if (!window.confirm(t('newtab_importConfirm'))) return
      await replaceBackupCollections(backup, {
        transaction: work => db.transaction('rw', db.quickLinks, db.archived, db.undo, work),
        quickLinks: db.quickLinks, archived: db.archived, undo: db.undo,
      })
      for (const key of Object.keys(backup.settings) as (keyof Settings)[]) {
        await saveSetting(key, backup.settings[key] as Settings[typeof key])
      }
      showToast(t('newtab_imported'))
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      showToast(t('newtab_importFailed', { error: String(errMsg(err)) }))
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleInitAddToQuickLink(tab: chrome.tabs.Tab) {
    if (!tab.url) return
    setQuicklinkingTab(tab)
    const links = await db.quickLinks.toArray()
    const defaultCategory = categoryLabel(DEFAULT_CATEGORY_ID)
    const cats = Array.from(new Set(links.map(l => l.category || defaultCategory)))
    setAvailableCategories(cats)
    setQlCategory(cats[0] || defaultCategory)
  }

  async function handleConfirmQuickLink(e: React.FormEvent) {
    e.preventDefault()
    if (!quicklinkingTab || !quicklinkingTab.url) return
    const domain = new URL(quicklinkingTab.url).hostname
    const title = quicklinkingTab.title || domain
    const quickLinks = await db.quickLinks.toArray()
    const order = quickLinks.length > 0 ? Math.max(...quickLinks.map(l => l.order)) + 1 : 0
    await db.quickLinks.add({ url: quicklinkingTab.url, title, order, category: qlCategory })
    showToast(t('newtab_addedToQuickLinks', { title }))
    setQuicklinkingTab(null)
  }

  function handleInitAddToBookmark(tab: chrome.tabs.Tab) {
    setBookmarkingTab(tab)
    chrome.bookmarks.getTree((tree) => {
      setBookmarkTree(tree[0]?.children || [])
    })
  }

  function handleConfirmBookmark(parentId: string) {
    if (!bookmarkingTab || !bookmarkingTab.url) return
    chrome.bookmarks.create({
      parentId,
      title: bookmarkingTab.title,
      url: bookmarkingTab.url
    }, () => {
      showToast(t('newtab_bookmarked'))
      setBookmarkingTab(null)
    })
  }

  function renderBookmarkTree(nodes: chrome.bookmarks.BookmarkTreeNode[], onSelect: (id: string) => void, depth = 0): React.ReactNode {
    return nodes.map(node => {
      if (!node.children) return null
      return (
        <div key={node.id}>
          <button type="button"
            style={{ 
              paddingBlock: '6px', paddingInlineStart: `${8 + depth * 16}px`, paddingInlineEnd: '8px',
              background: 'transparent', border: 0, width: '100%', textAlign: 'start', fontFamily: 'inherit',
              cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => onSelect(node.id)}
          >
            <span style={{color: '#f5a623'}}>📁</span> {node.title || (node.id === '1' ? t('bookmarks_bar') : node.id === '2' ? t('bookmarks_other') : t('bookmarks_folder'))}
          </button>
          {node.children.length > 0 && renderBookmarkTree(node.children, onSelect, depth + 1)}
        </div>
      )
    })
  }

  // ── 视图组件属性
  const viewProps = { 
    groups, collapsedIds, onToggleCollapse: toggleCollapse, onSwitch: switchToTab, 
    onClose: closeTab, onSend: handleSendToJustDoIt, selectedIds,
    onAddToQuickLink: handleInitAddToQuickLink, onAddToBookmark: handleInitAddToBookmark
  }
  const hideGroupHeader = settings.groupBy === 'none'
  const orderedNavItems = useMemo(() => sortNavItems(settings.navOrder), [settings.navOrder])

  const handleNavDragStart = (key: NavSection) => {
    dragNavKeyRef.current = key
    setDraggingNav(key)
  }

  const handleNavDrop = (targetKey: NavSection) => {
    const sourceKey = dragNavKeyRef.current
    setDraggingNav(null)
    setDropNavTarget(null)
    dragNavKeyRef.current = null

    if (!sourceKey || sourceKey === targetKey) return

    const nextOrder = (settings.navOrder.length > 0 ? [...settings.navOrder] : [...DEFAULT_SETTINGS.navOrder])
    const sourceIndex = nextOrder.indexOf(sourceKey)
    const targetIndex = nextOrder.indexOf(targetKey)
    if (sourceIndex === -1 || targetIndex === -1) return

    nextOrder.splice(sourceIndex, 1)
    nextOrder.splice(targetIndex, 0, sourceKey)
    saveSettingAndSync('navOrder', nextOrder)
  }

  const resetNavDrag = () => {
    setDraggingNav(null)
    setDropNavTarget(null)
    dragNavKeyRef.current = null
  }

  return (
    <div
      className={`nt-root ${settings.theme} layout-${settings.navigationLayout}${settings.wallpaper ? ' has-wallpaper' : ''}`}
      style={settings.wallpaper ? { background: 'transparent' } : undefined}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => { if (showSettings) setShowSettings(false) }}
    >
      {/* ─── 壁纸背景层（position:fixed，pointer-events:none 不抢交互） ─── */}
      {settings.wallpaper && (
        <>
          <div style={{
            position: 'fixed', inset: 0, zIndex: 2,
            backgroundImage: `url(${settings.wallpaper})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: `blur(${settings.wallpaperBlur}px)`,
            transform: 'scale(1.06)',
            transition: 'filter 0.4s',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'fixed', inset: 0, zIndex: 3,
            background: `rgba(0,0,0,${settings.wallpaperDim})`,
            pointerEvents: 'none',
            transition: 'background 0.4s',
          }} />
        </>
      )}
      <header className="nt-right-nav-wrap">
        <nav className="nt-right-nav" aria-label={t('newtab_mainNav')}>
          {/* Logo */}
          <div className="nt-brand">
            <img src="/icons/icon.svg" alt={brandName()} className="nt-right-nav-logo"
              onError={(e) => { (e.target as HTMLImageElement).src = '/icons/icon48.png' }} />
            <div><strong>{brandName()}</strong><span>{t('newtab_brandTagline')}</span></div>
          </div>
          <div className="nt-primary-nav">

          {/* 主导航项 */}
          {orderedNavItems.map(item => {
            const isActive = activeSection === item.key
            const isDragging = draggingNav === item.key
            const isDropTarget = dropNavTarget === item.key && draggingNav !== item.key
            return (
              <button
                key={item.key}
                draggable
                className={`nt-right-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={e => { e.stopPropagation(); setActiveSection(item.key) }}
                onDragStart={e => {
                  e.stopPropagation()
                  e.dataTransfer.effectAllowed = 'move'
                  handleNavDragStart(item.key)
                }}
                onDragOver={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'move'
                  setDropNavTarget(item.key)
                }}
                onDragLeave={e => {
                  e.stopPropagation()
                  if (dropNavTarget === item.key) setDropNavTarget(null)
                }}
                onDrop={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleNavDrop(item.key)
                }}
                onDragEnd={resetNavDrag}
                style={{
                  opacity: isDragging ? 0.55 : 1,
                  transform: isDragging ? 'scale(0.96)' : undefined,
                  boxShadow: isDropTarget ? `0 0 0 2px ${item.activeBorder}` : undefined,
                }}
                title={item.label}
              >
                <span className="nt-right-nav-icon">{item.icon}</span>
                <span className="nt-right-nav-label">
                  {item.label}
                </span>
              </button>
            )
          })}
          </div>

          <div className="nt-nav-tools">

          {/* 皮肤入口 */}
          <button
            className="nt-right-nav-tool"
            onClick={e => { e.stopPropagation(); setShowSkin(true) }}
            title={t('newtab_skinSettings')}
            aria-label={t('newtab_skinSettings')}
          ><IconPalette /></button>

          <button
            className="nt-right-nav-tool"
            onClick={e => { e.stopPropagation(); saveSettingAndSync('theme', settings.theme === 'light' ? 'dark' : 'light') }}
            title={settings.theme === 'light' ? t('newtab_switchToDark') : t('newtab_switchToLight')}
            aria-label={settings.theme === 'light' ? t('newtab_switchToDark') : t('newtab_switchToLight')}
          >
            {settings.theme === 'light' ? <IconMoon /> : <IconSun />}
          </button>

          {/* ⚙️ 设置 — 直接打开模态窗 */}
          <button
            className="nt-right-nav-tool"
            onClick={e => { e.stopPropagation(); setShowSettingsModal(true) }}
            title={t('common_settings')}
            aria-label={t('common_settings')}
          ><IconSettings /></button>
          </div>
        </nav>
      </header>

      {/* ─── 皮肤面板（挂载到 nt-root 直接子节点，避免被导航栏 stacking context 限制） ─── */}
      {showSkin && (
        <SkinPanel
          settings={settings}
          onClose={() => setShowSkin(false)}
          onSave={(key, value) => saveSettingAndSync(key, value as Settings[typeof key])}
        />
      )}

      <input type="file" ref={fileInputRef} onChange={handleImportData} style={{ display: 'none' }} accept=".json" />


      {/* 时钟 + 搜索（顶部固定区）*/}
      <div className="nt-sticky-top">
        <div className="nt-clock-area">
          <time className="nt-time" dateTime={time.toISOString()}>{timeStr}</time>
          <div className="nt-clock-copy">
            <div className="nt-date">{dateStr}</div>
            <div className="nt-greeting">{getGreeting()}</div>
          </div>
        </div>
        <div className="nt-search-stack">
        <div className="nt-search-area" role="search">
          <button type="button"
            className="nt-search-badge"
            title={t('newtab_engineTitle', { name: currentEngine.name })}
            aria-label={t('newtab_engineAria', { name: currentEngine.name })}
            onClick={cycleEngine}
          >
            <EngineIcon />
            <span>{currentEngine.name}</span>
          </button>
          <input ref={searchRef} className="nt-search-input"
            aria-label={t('newtab_searchAria')}
            placeholder={t('newtab_searchPlaceholder')}
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={handleSearch} />
          <div className="nt-enter-hint">
            <kbd>↵</kbd>
          </div>
        </div>
        <p className="nt-search-caption">{t('newtab_searchCaption', { engine: currentEngine.name })}</p>
        </div>
        
        {/* 工具栏：分组 + 视图 快捷切换 (仅在 Tab 视图显示且没有搜索词时) */}
        {!query && activeSection === 'tabs' && openTabs.length > 0 && (
          <div className="nt-toolbar">
            {/* 分组方式 pill 组 */}
            <div className="nt-toolbar-pills">
              {GROUP_SHORTCUTS.map(g => (
                <button
                  key={g.value}
                  className={`nt-pill ${settings.groupBy === g.value ? 'active' : ''}`}
                  onClick={() => saveSetting('groupBy', g.value)}
                  title={g.label}
                  aria-pressed={settings.groupBy === g.value}
                >
                  <span className="nt-pill-icon">{createElement(GROUP_ICONS[g.value], { size: 14, strokeWidth: 1.9, 'aria-hidden': true })}</span>
                  <span className="nt-pill-label">{g.label}</span>
                </button>
              ))}
            </div>
            {/* 视图模式图标按钮组 */}
            <div className="nt-toolbar-views">
              {VIEW_SHORTCUTS.map(v => (
                <button
                  key={v.value}
                  className={`nt-view-btn ${settings.viewMode === v.value ? 'active' : ''}`}
                  onClick={() => saveSetting('viewMode', v.value)}
                  title={v.label}
                  aria-label={v.label}
                  aria-pressed={settings.viewMode === v.value}
                >
                  {createElement(VIEW_ICONS[v.value], { size: 16, strokeWidth: 1.9, 'aria-hidden': true })}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 滚动主体 */}
      <main className={`nt-scroll-body ${activeSection === 'tabs' && settings.viewMode === 'kanban' ? 'kanban-mode' : ''}`}>
        <div className="nt-workspace-heading">
          <div>
            <h1>{query ? t('newtab_headingSearch') : activeSection === 'quicklinks' ? t('newtab_headingQuicklinks') : activeSection === 'bookmarks' ? t('newtab_headingBookmarks') : t('newtab_headingTabs')}</h1>
            <p>{query ? t('newtab_subtitleSearch') : activeSection === 'quicklinks' ? t('newtab_subtitleQuicklinks') : activeSection === 'bookmarks' ? t('newtab_subtitleBookmarks') : t('newtab_subtitleTabs')}</p>
          </div>
          {!query && activeSection === 'tabs' && <span className="nt-workspace-count">{plural('newtab_openPagesCount_one', 'newtab_openPagesCount_other', openTabs.length)}</span>}
        </div>

        {/* 当有搜索词时，全局展示搜索结果，屏蔽普通视图 */}
        {query ? (
          <>
            {groups.length > 0 && (
              <div className="nt-section">
                <div className="nt-section-title">{t('newtab_resultsOpen')}</div>
                {settings.viewMode === 'grid' && <GridView {...viewProps} hideGroupHeader={hideGroupHeader} />}
                {settings.viewMode === 'list' && <ListView {...viewProps} hideGroupHeader={hideGroupHeader} />}
                {settings.viewMode === 'kanban' && <KanbanView {...viewProps} />}
              </div>
            )}
            
            {filteredArchived.length > 0 && (
              <div className="nt-section">
                <div className="nt-section-title">{t('newtab_resultsArchived')}</div>
                <div className="nt-archived-list">
                  {filteredArchived.map(tab => (
                    <div key={tab.id} className="nt-archived-item" onClick={() => reopenArchived(tab)}>
                      <div className="nt-archived-dot" />
                      <div className="nt-archived-title">{tab.title}</div>
                      <div className="nt-archived-date">{formatDate(tab.archivedAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 原生书签检索结果 */}
            {searchedBookmarks.length > 0 && (
              <div className="nt-section">
                <div className="nt-section-title">{t('newtab_resultsBookmarks')}</div>
                <div className="nt-archived-list">
                  {searchedBookmarks.map(bookmark => (
                    <div key={bookmark.id} className="nt-archived-item" onClick={() => window.location.href = bookmark.url!} style={{ position: 'relative' }}>
                      <div className="nt-archived-dot" style={{ background: '#f5a623' }} />
                      <div className="nt-archived-title">{bookmark.title}</div>
                      <div className="nt-archived-date" style={{ display: 'flex', gap: '8px' }}>
                         <span style={{ fontSize: '12px', opacity: 0.6, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bookmark.url}</span>
                         <button onClick={(e) => {
                           e.stopPropagation();
                           sendToJustDoIt({ title: bookmark.title, url: bookmark.url! })
                             .then(() => showToast(t('newtab_bookmarkSentToInbox')))
                             .catch((err: unknown) => showToast(t('newtab_errorToast', { error: errMsg(err) ?? t('common_unknownError') })))
                         }} className="nt-batch-btn primary" style={{ padding: '2px 6px', fontSize: '10px' }}>{t('newtab_send')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {groups.length === 0 && filteredArchived.length === 0 && searchedBookmarks.length === 0 && (
               <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('newtab_noResults', { query })}</div>
            )}
          </>
        ) : (
          // 当没有搜索词时，根据 activeSection 渲染内容
          <>
            {activeSection === 'quicklinks' && <QuickLinksView />}
            {activeSection === 'bookmarks' && <BookmarksView showToast={showToast} />}
            {activeSection === 'tabs' && (
              <>
                {groups.length === 0 && filteredArchived.length === 0 && (
                  <div className="nt-empty-state"><h2>{t('newtab_emptyTitle')}</h2><p>{t('newtab_emptyBody')}</p></div>
                )}
                {/* Tab 展示区 */}
                {groups.length > 0 && (
                  <div className="nt-section">
                  <div className="nt-section-title">{t('newtab_currentlyOpen')} <span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.65, marginLeft: '6px' }}>{plural('newtab_pageCount_one', 'newtab_pageCount_other', openTabs.length)}</span></div>
                    {settings.viewMode === 'grid' &&
                      <GridView {...viewProps} hideGroupHeader={hideGroupHeader} />}
                    {settings.viewMode === 'list' &&
                      <ListView {...viewProps} hideGroupHeader={hideGroupHeader} />}
                    {settings.viewMode === 'kanban' &&
                      <KanbanView {...viewProps} />}
                  </div>
                )}
                {/* 最近归档 */}
                {filteredArchived.length > 0 && (
                  <div className="nt-section">
                    <div className="nt-section-title">{t('newtab_recentArchived')}</div>
                    <div className="nt-archived-list">
                      {filteredArchived.map(tab => (
                        <div key={tab.id} className="nt-archived-item" onClick={() => reopenArchived(tab)}>
                          <div className="nt-archived-dot" />
                          <div className="nt-archived-title">{tab.title}</div>
                          <div className="nt-archived-date">{formatDate(tab.archivedAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="nt-footer">
          {dailyQuote && <div className="nt-footer-quote">{dailyQuote}</div>}
          <div>{brandName()}</div>
        </div>
      </main>

      {/* Toast 提示 */}
      {toast && (
        <div className="nt-toast" role="status">
          {toast}
          {undoAction && <button className="nt-batch-btn primary" style={{marginLeft: '12px', padding: '2px 8px'}} disabled={undoBusy} onClick={undoAction}>{undoBusy ? t('newtab_restoring') : t('common_undo')}</button>}
        </div>
      )}

      {/* 框选区域 */}
      {selectionBox && (
        <div className="selection-box" style={{
          left: Math.min(selectionBox.startX, selectionBox.currentX),
          top: Math.min(selectionBox.startY, selectionBox.currentY),
          width: Math.abs(selectionBox.currentX - selectionBox.startX),
          height: Math.abs(selectionBox.currentY - selectionBox.startY),
        }} />
      )}

      {/* 批量操作工具栏 */}
      {selectedIds.size > 0 && (
        <div className="nt-batch-bar">
          <div className="nt-batch-info">
            {t('newtab_selectedBefore')} <span className="nt-batch-count">{selectedIds.size}</span> {plural('newtab_selectedAfter_one', 'newtab_selectedAfter_other', selectedIds.size)}
          </div>
          <div className="nt-batch-actions">
            <button className="nt-batch-btn primary" onClick={handleBatchSend}>{t('newtab_batchSend')}</button>
            <button className="nt-batch-btn" onClick={handleBatchClose}>{t('newtab_batchArchive')}</button>
            <button className="nt-batch-btn" onClick={() => setSelectedIds(new Set())}>{t('common_cancel')}</button>
          </div>
        </div>
      )}
      {/* ── 书签分类选择弹窗 ── */}
      {bookmarkingTab && (
        <Dialog label={t('newtab_addToBookmarks')} onClose={() => setBookmarkingTab(null)}>
          <div className="nt-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('newtab_addToBookmarks')}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bookmarkingTab.title}
            </p>
            <div className="nt-bookmark-picker" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--bg-card)' }}>
              {bookmarkTree.length > 0 ? renderBookmarkTree(bookmarkTree, handleConfirmBookmark) : <div style={{padding: '10px', fontSize: '13px', color: 'var(--text-muted)'}}>{t('newtab_bookmarkFoldersLoading')}</div>}
            </div>
            <div className="nt-modal-actions" style={{ marginTop: '16px' }}>
              <button className="nt-btn-cancel" onClick={() => setBookmarkingTab(null)}>{t('common_cancel')}</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── 常用导航分类选择弹窗 ── */}
      {quicklinkingTab && (
        <Dialog label={t('newtab_addToQuickLinks')} onClose={() => setQuicklinkingTab(null)}>
          <div className="nt-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('newtab_addToQuickLinks')}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {quicklinkingTab.title}
            </p>
            <form onSubmit={handleConfirmQuickLink} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t('newtab_chooseCategory')}</label>
                {availableCategories.length > 0 ? (
                  <select
                    aria-label={t('newtab_chooseCategory')}
                    value={availableCategories.includes(qlCategory) ? qlCategory : '__new__'}
                    onChange={e => setQlCategory(e.target.value === '__new__' ? '' : e.target.value)}
                    className="nt-input nt-select"
                    style={{ width: '100%' }}
                  >
                    {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__new__">{t('newtab_newCategoryOption')}</option>
                  </select>
                ) : null}
                {/* 没有现有分类、或选择了“新建分类”时显示输入框 */}
                {(!availableCategories.includes(qlCategory)) && (
                  <input
                    type="text"
                    aria-label={t('newtab_newCategoryName')}
                    value={qlCategory}
                    onChange={e => setQlCategory(e.target.value)}
                    placeholder={t('newtab_newCategoryPlaceholder')}
                    className="nt-input"
                    style={{ width: '100%', marginTop: availableCategories.length > 0 ? '8px' : '0' }}
                    autoFocus
                  />
                )}
              </div>
              <div className="nt-modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="nt-btn-cancel" onClick={() => setQuicklinkingTab(null)}>{t('common_cancel')}</button>
                <button type="submit" className="nt-btn-submit" disabled={!qlCategory.trim()}>{t('common_confirm')}</button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* ── 设置模态窗 ── */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onSettingChange={saveSettingAndSync}
          onClose={() => setShowSettingsModal(false)}
          onExport={handleExportData}
          onImport={() => fileInputRef.current?.click()}
        />
      )}
    </div>
  )
}
