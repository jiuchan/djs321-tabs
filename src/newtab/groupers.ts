import { GroupBy } from '../lib/settings'
import { inferPageCategoryId, categoryLabel, DEFAULT_CATEGORY_ID, type PageCategoryId } from '../lib/page-category'
import { t } from '../lib/i18n'
export { CATEGORY_RULES } from '../lib/page-category'

export interface TabGroup {
  id: string
  label: string
  color?: string    // Chrome 原生分组颜色
  tabs: chrome.tabs.Tab[]
}

// ── 工具函数
export function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ── 域名分组
function groupByDomain(tabs: chrome.tabs.Tab[]): TabGroup[] {
  const map = new Map<string, chrome.tabs.Tab[]>()
  for (const t of tabs) {
    const key = hostname(t.url || '')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([d, tabs]) => ({ id: d, label: d, tabs }))
}

// ── Chrome 原生 Tab Groups
async function groupByChromeGroup(tabs: chrome.tabs.Tab[]): Promise<TabGroup[]> {
  const grouped = new Map<number, chrome.tabs.Tab[]>()
  const ungrouped: chrome.tabs.Tab[] = []
  for (const t of tabs) {
    const gid = t.groupId ?? -1
    if (gid >= 0) {
      if (!grouped.has(gid)) grouped.set(gid, [])
      grouped.get(gid)!.push(t)
    } else ungrouped.push(t)
  }
  const result: TabGroup[] = []
  for (const [gid, tabs] of grouped) {
    try {
      const g = await chrome.tabGroups.get(gid)
      result.push({ id: `g${gid}`, label: g.title || t('group_unnamed'), color: g.color, tabs })
    } catch {
      result.push({ id: `g${gid}`, label: t('group_unnamed'), tabs })
    }
  }
  if (ungrouped.length > 0)
    result.push({ id: 'ungrouped', label: t('group_ungrouped'), tabs: ungrouped })
  return result
}

// ── 按窗口分组
function groupByWindow(tabs: chrome.tabs.Tab[]): TabGroup[] {
  const map = new Map<number, chrome.tabs.Tab[]>()
  for (const t of tabs) {
    const wid = t.windowId ?? -1
    if (!map.has(wid)) map.set(wid, [])
    map.get(wid)!.push(t)
  }
  let idx = 1
  return [...map.entries()].map(([wid, tabs]) => ({
    id: `win-${wid}`, label: t('group_window', { index: idx++ }), tabs,
  }))
}

// ── 按最近访问时间分组
function groupByTime(tabs: chrome.tabs.Tab[]): TabGroup[] {
  const now = Date.now()
  const DAY = 86400000
  type BucketKey = 'recent' | 'today' | 'yesterday' | 'older'
  const buckets: Record<BucketKey, { label: string; tabs: chrome.tabs.Tab[] }> = {
    recent:    { label: t('group_recent'),    tabs: [] },
    today:     { label: t('group_today'),     tabs: [] },
    yesterday: { label: t('group_yesterday'), tabs: [] },
    older:     { label: t('group_older'),     tabs: [] },
  }
  for (const t of tabs) {
    const la = (t as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed ?? now
    const diff = now - la
    if (diff < 3600000)   buckets.recent.tabs.push(t)
    else if (diff < DAY)  buckets.today.tabs.push(t)
    else if (diff < DAY*2) buckets.yesterday.tabs.push(t)
    else                   buckets.older.tabs.push(t)
  }
  return (Object.entries(buckets) as [BucketKey, { label: string; tabs: chrome.tabs.Tab[] }][])
    .filter(([, v]) => v.tabs.length > 0)
    .map(([k, v]) => ({ id: k, label: v.label, tabs: v.tabs }))
}

// ── 按内容类型（语义分类）
function groupByCategory(tabs: chrome.tabs.Tab[]): TabGroup[] {
  const map = new Map<PageCategoryId, chrome.tabs.Tab[]>()
  const other: chrome.tabs.Tab[] = []
  for (const t of tabs) {
    const id = inferPageCategoryId(t.url || '', t.title || '')
    if (id === DEFAULT_CATEGORY_ID) other.push(t)
    else {
      if (!map.has(id)) map.set(id, [])
      map.get(id)!.push(t)
    }
  }
  const result: TabGroup[] = [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([id, tabs]) => ({ id, label: categoryLabel(id), tabs }))
  if (other.length > 0) result.push({ id: 'other', label: t('group_other'), tabs: other })
  return result
}

// ── 主入口
export async function groupTabs(tabs: chrome.tabs.Tab[], groupBy: GroupBy): Promise<TabGroup[]> {
  if (tabs.length === 0) return []
  switch (groupBy) {
    case 'none':        return [{ id: 'all', label: t('group_allTabs'), tabs }]
    case 'domain':      return groupByDomain(tabs)
    case 'chromeGroup': return await groupByChromeGroup(tabs)
    case 'window':      return groupByWindow(tabs)
    case 'time':        return groupByTime(tabs)
    case 'category':    return groupByCategory(tabs)
  }
}
