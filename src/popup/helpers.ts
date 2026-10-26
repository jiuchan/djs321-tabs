export interface BookmarkFolderOption {
  id: string
  title: string
  path: string
  depth: number
}

export interface QuickLinkMatch {
  id?: number
  url: string
  title: string
  order: number
  iconUrl?: string
  category?: string
  prompt?: string
}

export interface BookmarkMatch {
  id: string
  title: string
  url?: string
  parentId?: string
}

export interface RecentAction {
  type: 'workspace' | 'inbox' | 'quicklink' | 'bookmark'
  title: string
  url: string
  detail: string
  at: string
}

export interface TabUrlTarget {
  id?: number
  title?: string
  url?: string | null
}

export type BookmarkFolderPreferenceMap = Record<string, string>
export type QuickLinkCategoryPreferenceMap = Record<string, string>

export interface BookmarkTabGroup<T extends TabUrlTarget> {
  folderId: string
  tabs: T[]
}

export interface BookmarkRuleSummary {
  hostname: string
  folderId: string
  folderPath: string
  folderTitle: string
}

export interface QuickLinkRuleSummary {
  hostname: string
  category: string
}

export interface RuleSnapshotV1 {
  version: 1
  exportedAt: string
  bookmarkFolderPrefs: BookmarkFolderPreferenceMap
  quickLinkCategoryPrefs: QuickLinkCategoryPreferenceMap
}

function normalizeFolderTitle(title: string, fallback: string) {
  return title.trim() || fallback
}

function sanitizeStringRecord(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid record payload')
  }

  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof key === 'string' && typeof value === 'string' && key.trim() && value.trim()) {
      clean[key] = value
    }
  }
  return clean
}

export function flattenBookmarkFolders(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  depth = 0,
  parents: string[] = [],
): BookmarkFolderOption[] {
  const folders: BookmarkFolderOption[] = []

  for (const node of nodes) {
    if (node.url) continue

    const title = normalizeFolderTitle(node.title || '', node.id === '1' ? '书签栏' : node.id === '2' ? '其他书签' : '未命名文件夹')
    const path = [...parents, title].join(' / ')
    folders.push({ id: node.id, title, path, depth })

    if (node.children && node.children.length > 0) {
      folders.push(...flattenBookmarkFolders(node.children, depth + 1, [...parents, title]))
    }
  }

  return folders
}

export function prioritizeRecentFolder(
  folders: BookmarkFolderOption[],
  recentFolderId: string | null | undefined,
) {
  if (!recentFolderId) return folders

  const target = folders.find(folder => folder.id === recentFolderId)
  if (!target) return folders

  return [target, ...folders.filter(folder => folder.id !== recentFolderId)]
}

export function normalizeComparableUrl(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = ''
    }
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    }
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

export function urlsMatch(a: string, b: string) {
  return normalizeComparableUrl(a) === normalizeComparableUrl(b)
}

export function getUrlHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function findMatchingQuickLink(quickLinks: QuickLinkMatch[], url: string) {
  return quickLinks.find(link => urlsMatch(link.url, url))
}

export function resolveBookmarkFolderPath(
  folders: BookmarkFolderOption[],
  parentId: string | undefined,
) {
  if (!parentId) return ''
  return folders.find(folder => folder.id === parentId)?.path || ''
}

export function findPreferredBookmark(
  matches: BookmarkMatch[],
  url: string,
  preferredParentId?: string | null,
) {
  const exactMatches = matches.filter(match => match.url && urlsMatch(match.url, url))
  if (exactMatches.length === 0) return undefined
  if (preferredParentId) {
    const preferred = exactMatches.find(match => match.parentId === preferredParentId)
    if (preferred) return preferred
  }
  return exactMatches[0]
}

export function pushRecentAction(
  current: RecentAction[],
  next: RecentAction,
  limit = 6,
) {
  const filtered = current.filter(item => !(item.type === next.type && urlsMatch(item.url, next.url)))
  return [next, ...filtered].slice(0, limit)
}

export function uniqueTabsByUrl<T extends TabUrlTarget>(tabs: T[]) {
  const seen = new Set<string>()
  const unique: T[] = []

  for (const tab of tabs) {
    if (!tab.url) continue
    const normalized = normalizeComparableUrl(tab.url)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(tab)
  }

  return unique
}

export function partitionTabsForQuickLinks<T extends TabUrlTarget>(
  tabs: T[],
  quickLinks: QuickLinkMatch[],
) {
  const uniqueTabs = uniqueTabsByUrl(tabs)
  const creatableTabs: T[] = []
  let existingCount = 0

  for (const tab of uniqueTabs) {
    if (!tab.url) continue
    if (findMatchingQuickLink(quickLinks, tab.url)) {
      existingCount += 1
    } else {
      creatableTabs.push(tab)
    }
  }

  return {
    creatableTabs,
    existingCount,
    duplicateCount: tabs.length - uniqueTabs.length,
  }
}

export function resolvePreferredFolderIdForUrl(
  url: string,
  preferences: BookmarkFolderPreferenceMap,
  recentFolderId?: string | null,
) {
  const hostname = getUrlHostname(url)
  if (hostname && preferences[hostname]) return preferences[hostname]
  return recentFolderId || null
}

export function rememberFolderPreferenceForUrl(
  preferences: BookmarkFolderPreferenceMap,
  url: string,
  folderId: string,
) {
  const hostname = getUrlHostname(url)
  if (!hostname || !folderId) return preferences
  return {
    ...preferences,
    [hostname]: folderId,
  }
}

export function clearFolderPreferenceForUrl(
  preferences: BookmarkFolderPreferenceMap,
  url: string,
) {
  const hostname = getUrlHostname(url)
  if (!hostname || !preferences[hostname]) return preferences

  const { [hostname]: _removed, ...rest } = preferences
  return rest
}

export function buildBookmarkRuleSummaries(
  preferences: BookmarkFolderPreferenceMap,
  folders: BookmarkFolderOption[],
) {
  const summaries: BookmarkRuleSummary[] = []

  for (const [hostname, folderId] of Object.entries(preferences)) {
    const folder = folders.find(item => item.id === folderId)
    if (!folder) continue
    summaries.push({
      hostname,
      folderId,
      folderPath: folder.path,
      folderTitle: folder.title,
    })
  }

  return summaries.sort((a, b) => a.hostname.localeCompare(b.hostname))
}

export function resolvePreferredQuickLinkCategoryForUrl(
  url: string,
  preferences: QuickLinkCategoryPreferenceMap,
  fallbackCategory: string,
) {
  const hostname = getUrlHostname(url)
  if (hostname && preferences[hostname]) return preferences[hostname]
  return fallbackCategory
}

export function rememberQuickLinkCategoryPreferenceForUrl(
  preferences: QuickLinkCategoryPreferenceMap,
  url: string,
  category: string,
) {
  const hostname = getUrlHostname(url)
  if (!hostname || !category) return preferences
  return {
    ...preferences,
    [hostname]: category,
  }
}

export function clearQuickLinkCategoryPreferenceForUrl(
  preferences: QuickLinkCategoryPreferenceMap,
  url: string,
) {
  const hostname = getUrlHostname(url)
  if (!hostname || !preferences[hostname]) return preferences

  const { [hostname]: _removed, ...rest } = preferences
  return rest
}

export function buildQuickLinkRuleSummaries(
  preferences: QuickLinkCategoryPreferenceMap,
) {
  return Object.entries(preferences)
    .map(([hostname, category]) => ({ hostname, category }))
    .sort((a, b) => a.hostname.localeCompare(b.hostname))
}

export function buildQuickLinkCategoryOptions(
  suggestedCategory: string,
  quickLinks: QuickLinkMatch[],
  preferences: QuickLinkCategoryPreferenceMap,
) {
  const categories = [
    suggestedCategory,
    ...quickLinks.map(link => link.category || ''),
    ...Object.values(preferences),
    '默认',
  ]

  return Array.from(
    new Set(
      categories
        .map(category => category.trim())
        .filter(Boolean),
    ),
  )
}

export function createRuleSnapshot(
  bookmarkFolderPrefs: BookmarkFolderPreferenceMap,
  quickLinkCategoryPrefs: QuickLinkCategoryPreferenceMap,
  exportedAt = new Date().toISOString(),
): RuleSnapshotV1 {
  return {
    version: 1,
    exportedAt,
    bookmarkFolderPrefs: { ...bookmarkFolderPrefs },
    quickLinkCategoryPrefs: { ...quickLinkCategoryPrefs },
  }
}

export function parseRuleSnapshot(raw: string): RuleSnapshotV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid snapshot payload')
  }

  const snapshot = parsed as Partial<RuleSnapshotV1>
  if (snapshot.version !== 1) {
    throw new Error('Unsupported snapshot version')
  }

  return {
    version: 1,
    exportedAt: typeof snapshot.exportedAt === 'string' && snapshot.exportedAt ? snapshot.exportedAt : new Date(0).toISOString(),
    bookmarkFolderPrefs: sanitizeStringRecord(snapshot.bookmarkFolderPrefs),
    quickLinkCategoryPrefs: sanitizeStringRecord(snapshot.quickLinkCategoryPrefs),
  }
}

export function partitionTabsForBookmarks<T extends TabUrlTarget>(
  tabs: T[],
  preferences: BookmarkFolderPreferenceMap,
  recentFolderId?: string | null,
) {
  const uniqueTabs = uniqueTabsByUrl(tabs)
  const groups = new Map<string, T[]>()
  let skippedCount = 0

  for (const tab of uniqueTabs) {
    if (!tab.url) continue
    const preferredFolderId = resolvePreferredFolderIdForUrl(tab.url, preferences, recentFolderId)
    if (!preferredFolderId) {
      skippedCount += 1
      continue
    }
    const bucket = groups.get(preferredFolderId) || []
    bucket.push(tab)
    groups.set(preferredFolderId, bucket)
  }

  return {
    groups: Array.from(groups.entries()).map(([folderId, groupedTabs]) => ({ folderId, tabs: groupedTabs })),
    skippedCount,
    duplicateCount: tabs.length - uniqueTabs.length,
  }
}
