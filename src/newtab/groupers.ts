import { GroupBy } from '../lib/settings'
import { inferPageCategory } from '../lib/page-category'
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
      result.push({ id: `g${gid}`, label: g.title || '未命名分组', color: g.color, tabs })
    } catch {
      result.push({ id: `g${gid}`, label: '未命名分组', tabs })
    }
  }
  if (ungrouped.length > 0)
    result.push({ id: 'ungrouped', label: '未分组', tabs: ungrouped })
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
    id: `win-${wid}`, label: `🪟 窗口 ${idx++}`, tabs,
  }))
}

// ── 按最近访问时间分组
function groupByTime(tabs: chrome.tabs.Tab[]): TabGroup[] {
  const now = Date.now()
  const DAY = 86400000
  type BucketKey = 'recent' | 'today' | 'yesterday' | 'older'
  const buckets: Record<BucketKey, { label: string; tabs: chrome.tabs.Tab[] }> = {
    recent:    { label: '⚡ 刚刚（1小时内）', tabs: [] },
    today:     { label: '☀️ 今天',           tabs: [] },
    yesterday: { label: '🌙 昨天',           tabs: [] },
    older:     { label: '📦 更早',           tabs: [] },
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
  const map = new Map<string, chrome.tabs.Tab[]>()
  const other: chrome.tabs.Tab[] = []
  for (const t of tabs) {
    const label = inferPageCategory(t.url || '', t.title || '')
    if (label === '默认') other.push(t)
    else {
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(t)
    }
  }
  const result = [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, tabs]) => ({ id: label, label, tabs }))
  if (other.length > 0) result.push({ id: 'other', label: '🔖 其他', tabs: other })
  return result
}

// ── 主入口
export async function groupTabs(tabs: chrome.tabs.Tab[], groupBy: GroupBy): Promise<TabGroup[]> {
  if (tabs.length === 0) return []
  switch (groupBy) {
    case 'none':        return [{ id: 'all', label: '全部标签', tabs }]
    case 'domain':      return groupByDomain(tabs)
    case 'chromeGroup': return await groupByChromeGroup(tabs)
    case 'window':      return groupByWindow(tabs)
    case 'time':        return groupByTime(tabs)
    case 'category':    return groupByCategory(tabs)
  }
}
