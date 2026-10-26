import { useEffect, useMemo, useRef, useState } from 'react'
import { isBrowserContentUrl, tabsInWindow } from '../lib/page-url'
import { errMsg } from '../lib/errors'
import { brandName } from '../lib/brand'
import { Archive, PanelsTopLeft, SearchX } from 'lucide-react'
import { db } from '../lib/db'
import { ArchivedTab, QuickLink } from '../types'
import { sendToJustDoIt, extractMarkdownFromTab } from '../lib/justdoit'
import { requestTabAction } from '../lib/tab-actions'
import { getRenderableFaviconUrl, pickPersistableFaviconUrl } from '../lib/favicon'
import {
  buildBookmarkRuleSummaries,
  buildQuickLinkCategoryOptions,
  buildQuickLinkRuleSummaries,
  clearFolderPreferenceForUrl,
  clearQuickLinkCategoryPreferenceForUrl,
  createRuleSnapshot,
  type BookmarkFolderPreferenceMap,
  findMatchingQuickLink,
  findPreferredBookmark,
  flattenBookmarkFolders,
  getUrlHostname,
  parseRuleSnapshot,
  partitionTabsForBookmarks,
  partitionTabsForQuickLinks,
  pushRecentAction,
  prioritizeRecentFolder,
  type QuickLinkCategoryPreferenceMap,
  rememberQuickLinkCategoryPreferenceForUrl,
  rememberFolderPreferenceForUrl,
  resolvePreferredFolderIdForUrl,
  resolvePreferredQuickLinkCategoryForUrl,
  resolveBookmarkFolderPath,
  type BookmarkFolderOption,
  type RecentAction,
  uniqueTabsByUrl,
  urlsMatch,
} from './helpers'
import { inferPageCategory } from '../lib/page-category'
import { bookmarkRecommendationLabel, collectBookmarkMatches, recommendBookmarkFolder } from './bookmark-recommendation'

type ViewMode = 'open' | 'archived'
type ToastTone = 'success' | 'error' | 'info'

const THEME_KEY = 'tb_popup_theme'
const RECENT_BOOKMARK_FOLDER_KEY = 'tb_popup_recent_bookmark_folder_id'
const BOOKMARK_FOLDER_PREFS_KEY = 'tb_popup_bookmark_folder_prefs'
const QUICKLINK_CATEGORY_PREFS_KEY = 'tb_popup_quicklink_category_prefs'
const CLOSE_AFTER_ACTION_KEY = 'tb_popup_close_after_action'
const RECENT_ACTIONS_KEY = 'tb_popup_recent_actions'

function isSupportedTab(tab?: chrome.tabs.Tab | null): tab is chrome.tabs.Tab {
  return Boolean(tab && isBrowserContentUrl(tab.url))
}

function getTabTitle(tab?: chrome.tabs.Tab | null) {
  return tab?.title?.trim() || tab?.url || '未命名页面'
}

function inferQuickLinkCategory(tab: chrome.tabs.Tab, quickLinks: QuickLink[]) {
  const hostname = (() => {
    try {
      return new URL(tab.url || '').hostname
    } catch {
      return ''
    }
  })()

  const sameDomain = quickLinks.find(link => {
    try {
      return new URL(link.url).hostname === hostname
    } catch {
      return false
    }
  })
  if (sameDomain?.category) return sameDomain.category

  return inferPageCategory(tab.url || '', tab.title || '')
}

function showFolderTitle(folder: BookmarkFolderOption) {
  return folder.depth === 0 ? folder.title : `${'　'.repeat(folder.depth)}${folder.title}`
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark')
  const [view, setView] = useState<ViewMode>('open')
  const [openTabs, setOpenTabs] = useState<chrome.tabs.Tab[]>([])
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([])
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null)
  const [currentWindowId, setCurrentWindowId] = useState<number>()
  const [archived, setArchived] = useState<ArchivedTab[]>([])
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ tone: ToastTone; text: string } | null>(null)
  const [actionLoading, setActionLoading] = useState({
    workspace: false,
    inbox: false,
    quicklink: false,
    bookmark: false,
    batchBookmark: false,
    batchWorkspace: false,
    batchQuicklink: false,
    batchArchive: false,
  })
  const [currentQuickLink, setCurrentQuickLink] = useState<QuickLink | null>(null)
  const [currentBookmark, setCurrentBookmark] = useState<{ id: string; title: string; folderId: string; folderPath: string } | null>(null)
  const [suggestedQuickLinkCategory, setSuggestedQuickLinkCategory] = useState('默认')
  const [closeAfterAction, setCloseAfterAction] = useState(false)
  const [recentActions, setRecentActions] = useState<RecentAction[]>([])
  const [recentFolderPath, setRecentFolderPath] = useState('')
  const [knownBookmarkFolders, setKnownBookmarkFolders] = useState<BookmarkFolderOption[]>([])
  const [knownBookmarks, setKnownBookmarks] = useState<ReturnType<typeof collectBookmarkMatches>>([])
  const [bookmarkFolderPrefs, setBookmarkFolderPrefs] = useState<BookmarkFolderPreferenceMap>({})
  const bookmarkFolderPrefsRef = useRef<BookmarkFolderPreferenceMap>({})
  const [quickLinkCategoryPrefs, setQuickLinkCategoryPrefs] = useState<QuickLinkCategoryPreferenceMap>({})
  const quickLinkCategoryPrefsRef = useRef<QuickLinkCategoryPreferenceMap>({})
  const importRulesInputRef = useRef<HTMLInputElement | null>(null)
  const [showRulesLibrary, setShowRulesLibrary] = useState(false)
  const [ruleSearch, setRuleSearch] = useState('')

  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false)
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolderOption[]>([])
  const [bookmarkFolderQuery, setBookmarkFolderQuery] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [recentFolderId, setRecentFolderId] = useState<string | null>(null)
  const [showQuickLinkPanel, setShowQuickLinkPanel] = useState(false)
  const [quickLinkCategoryOptions, setQuickLinkCategoryOptions] = useState<string[]>(['默认'])
  const [quickLinkCategoryQuery, setQuickLinkCategoryQuery] = useState('')
  const [selectedQuickLinkCategory, setSelectedQuickLinkCategory] = useState('默认')
  const [newQuickLinkCategory, setNewQuickLinkCategory] = useState('')
  const [quickLinkTitle, setQuickLinkTitle] = useState('')

  const showToast = (tone: ToastTone, text: string) => {
    setToast({ tone, text })
    window.setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev))
    }, 2200)
  }

  const loadTabs = () => {
    chrome.tabs.query({}, (tabs) => {
      const usableTabs = tabs.filter(isSupportedTab)
      setOpenTabs(usableTabs)
      chrome.tabs.query({ active: true, currentWindow: true }, activeTabs => {
        const active = activeTabs.find(isSupportedTab) || null
        setCurrentTab(active)
        setCurrentWindowId(activeTabs[0]?.windowId)
      })
    })
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    loadTabs()
    chrome.storage.local.get([CLOSE_AFTER_ACTION_KEY, RECENT_ACTIONS_KEY, BOOKMARK_FOLDER_PREFS_KEY, QUICKLINK_CATEGORY_PREFS_KEY], result => {
      setCloseAfterAction(Boolean(result[CLOSE_AFTER_ACTION_KEY]))
      setRecentActions(Array.isArray(result[RECENT_ACTIONS_KEY]) ? result[RECENT_ACTIONS_KEY] : [])
      setBookmarkFolderPrefs(
        result[BOOKMARK_FOLDER_PREFS_KEY] && typeof result[BOOKMARK_FOLDER_PREFS_KEY] === 'object'
          ? result[BOOKMARK_FOLDER_PREFS_KEY]
          : {},
      )
      setQuickLinkCategoryPrefs(
        result[QUICKLINK_CATEGORY_PREFS_KEY] && typeof result[QUICKLINK_CATEGORY_PREFS_KEY] === 'object'
          ? result[QUICKLINK_CATEGORY_PREFS_KEY]
          : {},
      )
    })
    void refreshRecentBookmarkFolderState()
  }, [])

  useEffect(() => {
    if (view === 'archived') {
      db.archived.orderBy('archivedAt').reverse().limit(200).toArray().then(setArchived)
    }
  }, [view])

  useEffect(() => {
    if (currentTab) {
      setBookmarkTitle(getTabTitle(currentTab))
      setQuickLinkTitle(getTabTitle(currentTab))
    }
  }, [currentTab?.id])

  useEffect(() => {
    if (!isSupportedTab(currentTab)) {
      setCurrentQuickLink(null)
      setCurrentBookmark(null)
      return
    }

    void refreshCurrentPageState(
      currentTab,
      resolvePreferredFolderIdForUrl(currentTab.url || '', bookmarkFolderPrefs, recentFolderId),
    )
  }, [currentTab?.url, recentFolderId, bookmarkFolderPrefs, quickLinkCategoryPrefs])

  const filteredOpen = useMemo(
    () =>
      openTabs.filter(
        t =>
          !query ||
          t.title?.toLowerCase().includes(query.toLowerCase()) ||
          t.url?.toLowerCase().includes(query.toLowerCase()),
      ),
    [openTabs, query],
  )

  const filteredArchived = useMemo(
    () =>
      archived.filter(
        t =>
          !query ||
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          t.url.toLowerCase().includes(query.toLowerCase()),
      ),
    [archived, query],
  )

  const selectedOpenTabs = useMemo(
    () => openTabs.filter(tab => Boolean(tab.id && selectedTabIds.includes(tab.id))),
    [openTabs, selectedTabIds],
  )

  const filteredSelectableIds = useMemo(
    () => filteredOpen.map(tab => tab.id).filter((id): id is number => typeof id === 'number'),
    [filteredOpen],
  )

  const currentWindowSelectableIds = useMemo(
    () =>
      tabsInWindow(filteredOpen, currentWindowId)
        .map(tab => tab.id)
        .filter((id): id is number => typeof id === 'number'),
    [filteredOpen, currentWindowId],
  )

  const currentWindowTabs = useMemo(() => tabsInWindow(openTabs, currentWindowId), [openTabs, currentWindowId])

  const bookmarkRecommendation = recommendBookmarkFolder({
    url: currentTab?.url || '',
    folders: knownBookmarkFolders,
    bookmarks: knownBookmarks,
    preferences: bookmarkFolderPrefs,
    recentFolderId,
    category: inferPageCategory(currentTab?.url || '', currentTab?.title || ''),
  })
  const preferredBookmarkFolderId = bookmarkRecommendation.folderId

  const preferredBookmarkFolderPath = useMemo(
    () => resolveBookmarkFolderPath(knownBookmarkFolders, preferredBookmarkFolderId || undefined),
    [knownBookmarkFolders, preferredBookmarkFolderId],
  )

  const currentHostname = useMemo(
    () => (currentTab?.url ? getUrlHostname(currentTab.url) : ''),
    [currentTab?.url],
  )

  const hostPreferredFolderId = useMemo(
    () => {
      const id = currentHostname && bookmarkFolderPrefs[currentHostname]
      return id && knownBookmarkFolders.some(folder => folder.id === id) ? id : null
    },
    [bookmarkFolderPrefs, currentHostname, knownBookmarkFolders],
  )

  const hostPreferredFolderPath = useMemo(
    () => resolveBookmarkFolderPath(knownBookmarkFolders, hostPreferredFolderId || undefined),
    [knownBookmarkFolders, hostPreferredFolderId],
  )

  const hostPreferredQuickLinkCategory = useMemo(
    () => (currentHostname ? quickLinkCategoryPrefs[currentHostname] || null : null),
    [quickLinkCategoryPrefs, currentHostname],
  )

  const bookmarkRuleSummaries = useMemo(
    () => buildBookmarkRuleSummaries(bookmarkFolderPrefs, knownBookmarkFolders),
    [bookmarkFolderPrefs, knownBookmarkFolders],
  )

  const quickLinkRuleSummaries = useMemo(
    () => buildQuickLinkRuleSummaries(quickLinkCategoryPrefs),
    [quickLinkCategoryPrefs],
  )

  const filteredBookmarkRuleSummaries = useMemo(() => {
    if (!ruleSearch.trim()) return bookmarkRuleSummaries
    const lower = ruleSearch.toLowerCase()
    return bookmarkRuleSummaries.filter(
      item =>
        item.hostname.toLowerCase().includes(lower) ||
        item.folderPath.toLowerCase().includes(lower) ||
        item.folderTitle.toLowerCase().includes(lower),
    )
  }, [bookmarkRuleSummaries, ruleSearch])

  const filteredQuickLinkRuleSummaries = useMemo(() => {
    if (!ruleSearch.trim()) return quickLinkRuleSummaries
    const lower = ruleSearch.toLowerCase()
    return quickLinkRuleSummaries.filter(
      item =>
        item.hostname.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower),
    )
  }, [quickLinkRuleSummaries, ruleSearch])

  useEffect(() => {
    bookmarkFolderPrefsRef.current = bookmarkFolderPrefs
  }, [bookmarkFolderPrefs])

  useEffect(() => {
    quickLinkCategoryPrefsRef.current = quickLinkCategoryPrefs
  }, [quickLinkCategoryPrefs])

  const [searchedBookmarks, setSearchedBookmarks] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  useEffect(() => {
    if (!query) {
      setSearchedBookmarks([])
      return
    }
    if (chrome.bookmarks) {
      chrome.bookmarks.search(query, results => {
        setSearchedBookmarks(results.filter(b => b.url).slice(0, 10))
      })
    }
  }, [query])

  const filteredFolderOptions = useMemo(() => {
    if (!bookmarkFolderQuery.trim()) return bookmarkFolders
    const lower = bookmarkFolderQuery.toLowerCase()
    return bookmarkFolders.filter(
      folder =>
        folder.title.toLowerCase().includes(lower) ||
      folder.path.toLowerCase().includes(lower),
    )
  }, [bookmarkFolders, bookmarkFolderQuery])

  const filteredQuickLinkCategoryOptions = useMemo(() => {
    if (!quickLinkCategoryQuery.trim()) return quickLinkCategoryOptions
    const lower = quickLinkCategoryQuery.toLowerCase()
    return quickLinkCategoryOptions.filter(category => category.toLowerCase().includes(lower))
  }, [quickLinkCategoryOptions, quickLinkCategoryQuery])

  function switchToTab(tab: chrome.tabs.Tab) {
    if (tab.id) chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true })
    window.close()
  }

  function updateSelection(ids: number[], checked: boolean) {
    setSelectedTabIds(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return Array.from(next)
    })
  }

  function toggleTabSelection(tabId: number, checked: boolean) {
    updateSelection([tabId], checked)
  }

  function clearSelection() {
    setSelectedTabIds([])
  }

  function closePopupSoon() {
    if (!closeAfterAction) return
    window.setTimeout(() => window.close(), 360)
  }

  function formatRecentTime(date: string) {
    return new Date(date).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getRecentFolderShortLabel(path: string) {
    const parts = path.split(' / ').filter(Boolean)
    return parts[parts.length - 1] || '最近文件夹'
  }

  async function setCloseAfterActionPreference(nextValue: boolean) {
    setCloseAfterAction(nextValue)
    await chrome.storage.local.set({ [CLOSE_AFTER_ACTION_KEY]: nextValue })
  }

  async function refreshRecentBookmarkFolderState(explicitFolderId?: string | null) {
    const storedRecent = await new Promise<string | null>(resolve => {
      chrome.storage.local.get([RECENT_BOOKMARK_FOLDER_KEY], result => {
        resolve(typeof result[RECENT_BOOKMARK_FOLDER_KEY] === 'string' ? result[RECENT_BOOKMARK_FOLDER_KEY] : null)
      })
    })
    const targetRecent = explicitFolderId === undefined ? storedRecent : explicitFolderId
    const tree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>(resolve => {
      chrome.bookmarks.getTree(nodes => resolve(nodes[0]?.children || []))
    })
    const folders = flattenBookmarkFolders(tree)
    setKnownBookmarkFolders(folders)
    setKnownBookmarks(collectBookmarkMatches(tree))
    setRecentFolderId(targetRecent)
    setRecentFolderPath(resolveBookmarkFolderPath(folders, targetRecent || undefined))
    return { folders, tree, targetRecent }
  }

  async function recordRecentAction(nextAction: RecentAction) {
    const nextItems = pushRecentAction(recentActions, nextAction)
    setRecentActions(nextItems)
    await chrome.storage.local.set({ [RECENT_ACTIONS_KEY]: nextItems })
  }

  async function archiveTab(tab: chrome.tabs.Tab) {
    try {
      await requestTabAction({ type: 'ARCHIVE_TAB', tabId: tab.id })
      const records = await db.archived.orderBy('archivedAt').reverse().limit(200).toArray()
      setArchived(records)
      showToast('success', '已归档，原标签保留')
    } catch (error) {
      showToast('error', errMsg(error) || '归档失败')
    }
  }

  async function closeTab(tab: chrome.tabs.Tab) {
    if (tab.id != null) await chrome.tabs.remove(tab.id)
    setOpenTabs(prev => prev.filter(t => t.id !== tab.id))
    if (currentTab?.id === tab.id) setCurrentTab(null)
  }

  function reopenArchived(tab: ArchivedTab) {
    chrome.tabs.create({ url: tab.url })
    window.close()
  }

  async function deleteArchived(tab: ArchivedTab) {
    if (tab.id) {
      await db.archived.delete(tab.id)
      setArchived(prev => prev.filter(t => t.id !== tab.id))
    }
  }

  async function exportJSON() {
    const all = await db.archived.toArray()
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    chrome.downloads.download({ url, filename: 'djs321-tabs-export.json' })
  }

  async function exportMarkdown() {
    const all = await db.archived.orderBy('archivedAt').reverse().toArray()
    const lines = [`# ${brandName()} 归档`, '', ...all.map(t => `- [${t.title}](${t.url})`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    chrome.downloads.download({ url, filename: 'djs321-tabs-export.md' })
  }

  function formatDate(date: Date) {
    return new Date(date).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  async function loadBookmarkFolders() {
    const { folders: rawFolders, tree, targetRecent } = await refreshRecentBookmarkFolderState()
    const recommendation = recommendBookmarkFolder({
      url: currentTab?.url || '', folders: rawFolders, bookmarks: collectBookmarkMatches(tree),
      preferences: bookmarkFolderPrefsRef.current, recentFolderId: targetRecent,
      category: inferPageCategory(currentTab?.url || '', currentTab?.title || ''),
    })
    const folders = prioritizeRecentFolder(rawFolders, recommendation.folderId)
    setBookmarkFolders(folders)
    setSelectedFolderId(recommendation.folderId || '')
  }

  async function refreshCurrentPageState(tab: chrome.tabs.Tab, preferredBookmarkFolderId?: string | null) {
    const tabUrl = tab.url || ''
    const quickLinks = await db.quickLinks.toArray()
    const matchedQuickLink = findMatchingQuickLink(quickLinks, tabUrl) || null
    setCurrentQuickLink(matchedQuickLink)
    const preferredCategory = resolvePreferredQuickLinkCategoryForUrl(
      tabUrl,
      quickLinkCategoryPrefsRef.current,
      matchedQuickLink?.category || inferQuickLinkCategory(tab, quickLinks),
    )
    setSuggestedQuickLinkCategory(preferredCategory)
    setQuickLinkCategoryOptions(
      buildQuickLinkCategoryOptions(
        preferredCategory,
        quickLinks,
        quickLinkCategoryPrefsRef.current,
      ),
    )

    const [tree, bookmarkMatches] = await Promise.all([
      new Promise<chrome.bookmarks.BookmarkTreeNode[]>(resolve => {
        chrome.bookmarks.getTree(nodes => resolve(nodes[0]?.children || []))
      }),
      new Promise<chrome.bookmarks.BookmarkTreeNode[]>(resolve => {
        chrome.bookmarks.search(tabUrl, results => {
          resolve(results.filter(result => result.url && urlsMatch(result.url, tabUrl)))
        })
      }),
    ])

    const folders = flattenBookmarkFolders(tree)
    setKnownBookmarkFolders(folders)
    setKnownBookmarks(collectBookmarkMatches(tree))
    const preferredFolderId = preferredBookmarkFolderId ?? resolvePreferredFolderIdForUrl(tabUrl, bookmarkFolderPrefs, recentFolderId)
    const match = findPreferredBookmark(bookmarkMatches, tabUrl, preferredFolderId)
    setCurrentBookmark(
      match
        ? {
            id: match.id,
            title: match.title || getTabTitle(tab),
            folderId: match.parentId || '',
            folderPath: resolveBookmarkFolderPath(folders, match.parentId),
          }
        : null,
    )
  }

  async function ensureQuickLinkForTab(tab: chrome.tabs.Tab, categoryOverride?: string, titleOverride?: string) {
    const quickLinks = await db.quickLinks.toArray()
    const category = (categoryOverride || resolvePreferredQuickLinkCategoryForUrl(
      tab.url || '',
      quickLinkCategoryPrefsRef.current,
      inferQuickLinkCategory(tab, quickLinks),
    )).trim() || '默认'
    const title = titleOverride?.trim() || getTabTitle(tab)
    const existing = findMatchingQuickLink(quickLinks, tab.url || '')
    if (existing) {
      const updatedQuickLink = {
        ...existing,
        title,
        category,
      }
      if (typeof existing.id === 'number') {
        await db.quickLinks.update(existing.id, { title, category })
      }
      setCurrentQuickLink(updatedQuickLink)
      return {
        created: false,
        updated: existing.title !== title || existing.category !== category,
        quickLink: updatedQuickLink,
      }
    }

    const iconUrl = pickPersistableFaviconUrl(tab.favIconUrl)
    const order = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0

    const rawId = await db.quickLinks.add({
      url: tab.url || '',
      title,
      iconUrl,
      order,
      category,
    })
    const id = typeof rawId === 'number' ? rawId : undefined

    const createdQuickLink: QuickLink = {
      id,
      url: tab.url || '',
      title,
      iconUrl,
      order,
      category,
    }
    setCurrentQuickLink(createdQuickLink)
    return { created: true, updated: false, quickLink: createdQuickLink }
  }

  async function sendCurrentTabToInbox(tab: chrome.tabs.Tab) {
    const content = tab.id ? await extractMarkdownFromTab(tab.id, tab.url) : undefined
    await sendToJustDoIt({
      title: getTabTitle(tab),
      url: tab.url || '',
      content,
    })
  }

  async function upsertBookmarkForFolder(
    tab: chrome.tabs.Tab,
    baseFolderId: string,
    title: string,
    childFolderName = '',
    shouldRefreshUi = true,
  ) {
    let targetFolderId = baseFolderId

    if (childFolderName.trim()) {
      const createdFolder = await new Promise<chrome.bookmarks.BookmarkTreeNode>(resolve => {
        chrome.bookmarks.create({ parentId: baseFolderId, title: childFolderName.trim() }, node => resolve(node))
      })
      targetFolderId = createdFolder.id
    }

    const exactMatches = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>(resolve => {
      chrome.bookmarks.search(tab.url || '', results => {
        resolve(results.filter(result => result.url && urlsMatch(result.url, tab.url || '')))
      })
    })

    const existingInFolder = exactMatches.find(node => node.parentId === targetFolderId)
    if (existingInFolder) {
      await new Promise<void>(resolve => {
        chrome.bookmarks.update(existingInFolder.id, { title: title.trim() || getTabTitle(tab) }, () => resolve())
      })
    } else {
      await new Promise<void>(resolve => {
        chrome.bookmarks.create(
          {
            parentId: targetFolderId,
            title: title.trim() || getTabTitle(tab),
            url: tab.url,
          },
          () => resolve(),
        )
      })
    }

    const nextPrefs = rememberFolderPreferenceForUrl(bookmarkFolderPrefsRef.current, tab.url || '', targetFolderId)
    bookmarkFolderPrefsRef.current = nextPrefs
    setBookmarkFolderPrefs(nextPrefs)
    await chrome.storage.local.set({
      [RECENT_BOOKMARK_FOLDER_KEY]: targetFolderId,
      [BOOKMARK_FOLDER_PREFS_KEY]: nextPrefs,
    })

    let folders = knownBookmarkFolders
    if (shouldRefreshUi) {
      const refreshed = await refreshRecentBookmarkFolderState(targetFolderId)
      folders = refreshed.folders
      await refreshCurrentPageState(tab, targetFolderId)
    }

    return {
      updated: Boolean(existingInFolder),
      targetFolderId,
      folderPath: resolveBookmarkFolderPath(folders, targetFolderId),
    }
  }

  async function saveBookmarkFolderPrefs(nextPrefs: BookmarkFolderPreferenceMap) {
    bookmarkFolderPrefsRef.current = nextPrefs
    setBookmarkFolderPrefs(nextPrefs)
    await chrome.storage.local.set({ [BOOKMARK_FOLDER_PREFS_KEY]: nextPrefs })
  }

  async function saveQuickLinkCategoryPrefs(nextPrefs: QuickLinkCategoryPreferenceMap) {
    quickLinkCategoryPrefsRef.current = nextPrefs
    setQuickLinkCategoryPrefs(nextPrefs)
    await chrome.storage.local.set({ [QUICKLINK_CATEGORY_PREFS_KEY]: nextPrefs })
  }

  async function handlePinCurrentBookmarkRule() {
    if (!isSupportedTab(currentTab) || !currentBookmark?.folderId) return
    const nextPrefs = rememberFolderPreferenceForUrl(
      bookmarkFolderPrefsRef.current,
      currentTab.url || '',
      currentBookmark.folderId,
    )
    await saveBookmarkFolderPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, currentBookmark.folderId)
    showToast('success', '已记住这个站点的收藏规则')
  }

  async function handleClearCurrentBookmarkRule() {
    if (!isSupportedTab(currentTab) || !currentHostname) return
    const nextPrefs = clearFolderPreferenceForUrl(bookmarkFolderPrefsRef.current, currentTab.url || '')
    await saveBookmarkFolderPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, recentFolderId)
    showToast('success', '已清除这个站点的收藏规则')
  }

  async function handleRememberCurrentQuickLinkRule() {
    if (!isSupportedTab(currentTab) || !suggestedQuickLinkCategory) return
    const nextPrefs = rememberQuickLinkCategoryPreferenceForUrl(
      quickLinkCategoryPrefsRef.current,
      currentTab.url || '',
      suggestedQuickLinkCategory,
    )
    await saveQuickLinkCategoryPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
    showToast('success', '已记住这个站点的导航分类规则')
  }

  async function handleClearCurrentQuickLinkRule() {
    if (!isSupportedTab(currentTab) || !currentHostname) return
    const nextPrefs = clearQuickLinkCategoryPreferenceForUrl(quickLinkCategoryPrefsRef.current, currentTab.url || '')
    await saveQuickLinkCategoryPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
    showToast('success', '已清除这个站点的导航分类规则')
  }

  async function handleApplyRuleFolderToCurrentSite(folderId: string) {
    if (!isSupportedTab(currentTab)) return
    const nextPrefs = rememberFolderPreferenceForUrl(bookmarkFolderPrefsRef.current, currentTab.url || '', folderId)
    await saveBookmarkFolderPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, folderId)
    showToast('success', '已把这条规则应用到当前站点')
  }

  async function handleRemoveRuleForHostname(hostname: string) {
    const { [hostname]: _removed, ...rest } = bookmarkFolderPrefsRef.current
    await saveBookmarkFolderPrefs(rest)
    if (currentHostname === hostname && isSupportedTab(currentTab)) {
      await refreshCurrentPageState(currentTab, recentFolderId)
    }
    showToast('success', '规则已删除')
  }

  async function handleApplyQuickLinkCategoryToCurrentSite(category: string) {
    if (!isSupportedTab(currentTab)) return
    const nextPrefs = rememberQuickLinkCategoryPreferenceForUrl(
      quickLinkCategoryPrefsRef.current,
      currentTab.url || '',
      category,
    )
    await saveQuickLinkCategoryPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
    showToast('success', '已把这条导航分类规则应用到当前站点')
  }

  async function handleRemoveQuickLinkRuleForHostname(hostname: string) {
    const nextPrefs = clearQuickLinkCategoryPreferenceForUrl(
      quickLinkCategoryPrefsRef.current,
      `https://${hostname}/`,
    )
    await saveQuickLinkCategoryPrefs(nextPrefs)
    if (currentHostname === hostname && isSupportedTab(currentTab)) {
      await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
    }
    showToast('success', '导航分类规则已删除')
  }

  async function handleExportRules() {
    try {
      const snapshot = createRuleSnapshot(bookmarkFolderPrefsRef.current, quickLinkCategoryPrefsRef.current)
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      chrome.downloads.download({
        url,
        filename: `djs321-tabs-rules-${new Date().toISOString().slice(0, 10)}.json`,
      })
      showToast('success', '规则已导出')
    } catch (error) {
      showToast('error', errMsg(error) || '导出规则失败')
    }
  }

  function handleImportRulesClick() {
    importRulesInputRef.current?.click()
  }

  async function handleImportRulesFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const snapshot = parseRuleSnapshot(text)
      await Promise.all([
        saveBookmarkFolderPrefs(snapshot.bookmarkFolderPrefs),
        saveQuickLinkCategoryPrefs(snapshot.quickLinkCategoryPrefs),
      ])
      await refreshRecentBookmarkFolderState(recentFolderId)
      if (isSupportedTab(currentTab)) {
        await refreshCurrentPageState(currentTab, resolvePreferredFolderIdForUrl(currentTab.url || '', snapshot.bookmarkFolderPrefs, recentFolderId))
      }
      showToast(
        'success',
        `已导入 ${Object.keys(snapshot.bookmarkFolderPrefs).length} 条书签规则和 ${Object.keys(snapshot.quickLinkCategoryPrefs).length} 条导航规则`,
      )
    } catch (error) {
      showToast('error', errMsg(error) || '导入规则失败')
    }
  }

  async function handleCaptureCurrentWorkspace() {
    if (!isSupportedTab(currentTab)) return
    setActionLoading(prev => ({ ...prev, workspace: true }))
    try {
      await sendCurrentTabToInbox(currentTab)
      const { created } = await ensureQuickLinkForTab(currentTab)
      await recordRecentAction({
        type: 'workspace',
        title: getTabTitle(currentTab),
        url: currentTab.url || '',
        detail: created ? '收件箱 + 导航' : '收件箱',
        at: new Date().toISOString(),
      })
      showToast('success', created ? '已发到收件箱，并加入导航' : '已发到收件箱')
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '操作失败')
    } finally {
      setActionLoading(prev => ({ ...prev, workspace: false }))
    }
  }

  async function handleSendCurrentToJustDoIt() {
    if (!isSupportedTab(currentTab)) return
    setActionLoading(prev => ({ ...prev, inbox: true }))
    try {
      await sendCurrentTabToInbox(currentTab)
      await recordRecentAction({
        type: 'inbox',
        title: getTabTitle(currentTab),
        url: currentTab.url || '',
        detail: '发到收件箱',
        at: new Date().toISOString(),
      })
      showToast('success', '已发送到倒计时321收件箱')
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '发送失败')
    } finally {
      setActionLoading(prev => ({ ...prev, inbox: false }))
    }
  }

  async function handleOpenQuickLinkPanel() {
    if (!isSupportedTab(currentTab)) return
    const quickLinks = await db.quickLinks.toArray()
    const category = currentQuickLink?.category || suggestedQuickLinkCategory || '默认'
    setQuickLinkTitle(currentQuickLink?.title || getTabTitle(currentTab))
    setSelectedQuickLinkCategory(category)
    setQuickLinkCategoryOptions(
      buildQuickLinkCategoryOptions(
        category,
        quickLinks,
        quickLinkCategoryPrefsRef.current,
      ),
    )
    setQuickLinkCategoryQuery('')
    setNewQuickLinkCategory('')
    setShowBookmarkPanel(false)
    setShowQuickLinkPanel(true)
  }

  async function handleAddCurrentToQuickLinks() {
    if (!isSupportedTab(currentTab)) return
    const category = (newQuickLinkCategory.trim() || selectedQuickLinkCategory || suggestedQuickLinkCategory || '默认').trim()
    setActionLoading(prev => ({ ...prev, quicklink: true }))
    try {
      const { created, updated, quickLink } = await ensureQuickLinkForTab(currentTab, category, quickLinkTitle)
      const nextPrefs = rememberQuickLinkCategoryPreferenceForUrl(
        quickLinkCategoryPrefsRef.current,
        currentTab.url || '',
        quickLink.category || category,
      )
      await saveQuickLinkCategoryPrefs(nextPrefs)
      await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
      setShowQuickLinkPanel(false)
      setNewQuickLinkCategory('')
      await recordRecentAction({
        type: 'quicklink',
        title: quickLink.title || getTabTitle(currentTab),
        url: currentTab.url || '',
        detail: quickLink.category || '默认',
        at: new Date().toISOString(),
      })
      showToast(
        'success',
        created
          ? `已添加到导航 · ${quickLink.category || '默认'}`
          : updated
            ? `导航分类已更新 · ${quickLink.category || '默认'}`
            : `导航已保持在 · ${quickLink.category || '默认'}`,
      )
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '添加导航失败')
    } finally {
      setActionLoading(prev => ({ ...prev, quicklink: false }))
    }
  }

  async function handleOpenBookmarkPanel() {
    if (!isSupportedTab(currentTab)) return
    await loadBookmarkFolders()
    setNewFolderName('')
    setBookmarkFolderQuery('')
    setBookmarkTitle(getTabTitle(currentTab))
    setShowQuickLinkPanel(false)
    setShowBookmarkPanel(true)
  }

  async function handleSaveCurrentBookmark() {
    if (!isSupportedTab(currentTab) || !selectedFolderId) return
    setActionLoading(prev => ({ ...prev, bookmark: true }))

    try {
      const result = await upsertBookmarkForFolder(currentTab, selectedFolderId, bookmarkTitle, newFolderName)
      setShowBookmarkPanel(false)
      setNewFolderName('')
      await recordRecentAction({
        type: 'bookmark',
        title: bookmarkTitle.trim() || getTabTitle(currentTab),
        url: currentTab.url || '',
        detail: result.folderPath || '书签',
        at: new Date().toISOString(),
      })
      showToast('success', result.updated ? '书签已更新' : '已加入书签')
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '收藏失败')
    } finally {
      setActionLoading(prev => ({ ...prev, bookmark: false }))
    }
  }

  async function handleQuickSaveToRecentFolder() {
    if (!isSupportedTab(currentTab)) return
    if (!preferredBookmarkFolderId) {
      await handleOpenBookmarkPanel()
      return
    }

    setActionLoading(prev => ({ ...prev, bookmark: true }))
    try {
      const result = await upsertBookmarkForFolder(currentTab, preferredBookmarkFolderId, getTabTitle(currentTab))
      await recordRecentAction({
        type: 'bookmark',
        title: getTabTitle(currentTab),
        url: currentTab.url || '',
        detail: result.folderPath || '书签',
        at: new Date().toISOString(),
      })
      showToast('success', result.updated ? '默认收藏已更新' : '已收藏到默认文件夹')
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '快速收藏失败')
    } finally {
      setActionLoading(prev => ({ ...prev, bookmark: false }))
    }
  }

  async function handleBatchBookmark() {
    if (selectedOpenTabs.length === 0) return
    setActionLoading(prev => ({ ...prev, batchBookmark: true }))
    try {
      const { groups, skippedCount, duplicateCount } = partitionTabsForBookmarks(
        selectedOpenTabs,
        bookmarkFolderPrefs,
        recentFolderId,
      )

      if (groups.length === 0) {
        showToast('info', '还没有可用的默认收藏文件夹')
        return
      }

      let processed = 0
      let updatedCount = 0
      let lastFolderId: string | null = null

      for (const group of groups) {
        for (const tab of group.tabs) {
          const result = await upsertBookmarkForFolder(tab, group.folderId, getTabTitle(tab), '', false)
          processed += 1
          updatedCount += result.updated ? 1 : 0
          lastFolderId = result.targetFolderId
        }
      }

      if (lastFolderId) {
        await refreshRecentBookmarkFolderState(lastFolderId)
      }
      if (isSupportedTab(currentTab)) {
        await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
      }

      await recordRecentAction({
        type: 'bookmark',
        title: `${processed} 个页面`,
        url: groups[0]?.tabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail:
          skippedCount > 0 || duplicateCount > 0
            ? `批量收藏，跳过 ${skippedCount + duplicateCount} 个未匹配或重复页面`
            : '批量收藏',
        at: new Date().toISOString(),
      })
      clearSelection()
      showToast('success', updatedCount > 0 ? `已处理 ${processed} 个收藏，更新 ${updatedCount} 个` : `已收藏 ${processed} 个页面`)
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '批量收藏失败')
    } finally {
      setActionLoading(prev => ({ ...prev, batchBookmark: false }))
    }
  }

  async function handleBatchCaptureWorkspace() {
    if (selectedOpenTabs.length === 0) return
    setActionLoading(prev => ({ ...prev, batchWorkspace: true }))
    try {
      const uniqueTabs = uniqueTabsByUrl(selectedOpenTabs)
      await sendToJustDoIt(
        uniqueTabs.map(tab => ({
          title: getTabTitle(tab),
          url: tab.url || '',
        })),
      )

      const quickLinks = await db.quickLinks.toArray()
      const { creatableTabs } = partitionTabsForQuickLinks(uniqueTabs, quickLinks)
      if (creatableTabs.length > 0) {
        const baseOrder = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0
        await db.quickLinks.bulkAdd(
          creatableTabs.map((tab, index) => {
            return {
              url: tab.url || '',
              title: getTabTitle(tab),
              iconUrl: pickPersistableFaviconUrl(tab.favIconUrl),
              order: baseOrder + index,
              category: resolvePreferredQuickLinkCategoryForUrl(
                tab.url || '',
                quickLinkCategoryPrefsRef.current,
                inferQuickLinkCategory(tab, quickLinks),
              ),
            }
          }),
        )
      }

      if (isSupportedTab(currentTab)) {
        await refreshCurrentPageState(currentTab)
      }

      await recordRecentAction({
        type: 'workspace',
        title: `${uniqueTabs.length} 个页面`,
        url: uniqueTabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail: creatableTabs.length > 0 ? `批量收进工作台，新增 ${creatableTabs.length} 个导航` : '批量发到收件箱',
        at: new Date().toISOString(),
      })
      showToast('success', `已处理 ${uniqueTabs.length} 个页面`)
      clearSelection()
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '批量收进工作台失败')
    } finally {
      setActionLoading(prev => ({ ...prev, batchWorkspace: false }))
    }
  }

  async function handleBatchAddToQuickLinks() {
    if (selectedOpenTabs.length === 0) return
    setActionLoading(prev => ({ ...prev, batchQuicklink: true }))
    try {
      const quickLinks = await db.quickLinks.toArray()
      const { creatableTabs, existingCount, duplicateCount } = partitionTabsForQuickLinks(selectedOpenTabs, quickLinks)
      if (creatableTabs.length === 0) {
        showToast('info', existingCount > 0 || duplicateCount > 0 ? '选中的页面都已经在导航里了' : '没有可添加的页面')
        return
      }

      const baseOrder = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0
      await db.quickLinks.bulkAdd(
        creatableTabs.map((tab, index) => {
          return {
            url: tab.url || '',
            title: getTabTitle(tab),
            iconUrl: pickPersistableFaviconUrl(tab.favIconUrl),
            order: baseOrder + index,
            category: resolvePreferredQuickLinkCategoryForUrl(
              tab.url || '',
              quickLinkCategoryPrefsRef.current,
              inferQuickLinkCategory(tab, quickLinks),
            ),
          }
        }),
      )

      if (isSupportedTab(currentTab)) {
        await refreshCurrentPageState(currentTab)
      }

      await recordRecentAction({
        type: 'quicklink',
        title: `${creatableTabs.length} 个页面`,
        url: creatableTabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail: existingCount > 0 ? `批量加入导航，跳过 ${existingCount + duplicateCount} 个重复项` : '批量加入导航',
        at: new Date().toISOString(),
      })
      showToast('success', `已加入导航 ${creatableTabs.length} 个页面`)
      clearSelection()
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '批量加入导航失败')
    } finally {
      setActionLoading(prev => ({ ...prev, batchQuicklink: false }))
    }
  }

  async function handleCaptureAllToWorkspace() {
    setActionLoading(prev => ({ ...prev, batchWorkspace: true }))
    try {
      const uniqueTabs = uniqueTabsByUrl(currentWindowTabs)
      if (uniqueTabs.length === 0) return
      await sendToJustDoIt(uniqueTabs.map(tab => ({ title: getTabTitle(tab), url: tab.url || '' })))
      const quickLinks = await db.quickLinks.toArray()
      const { creatableTabs } = partitionTabsForQuickLinks(uniqueTabs, quickLinks)
      if (creatableTabs.length > 0) {
        const baseOrder = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0
        await db.quickLinks.bulkAdd(
          creatableTabs.map((tab, index) => ({
            url: tab.url || '',
            title: getTabTitle(tab),
            iconUrl: pickPersistableFaviconUrl(tab.favIconUrl),
            order: baseOrder + index,
            category: resolvePreferredQuickLinkCategoryForUrl(tab.url || '', quickLinkCategoryPrefsRef.current, inferQuickLinkCategory(tab, quickLinks)),
          })),
        )
      }
      if (isSupportedTab(currentTab)) await refreshCurrentPageState(currentTab)
      await recordRecentAction({ type: 'workspace', title: `${uniqueTabs.length} 个页面`, url: uniqueTabs[0]?.url || '', detail: '整窗收进工作台', at: new Date().toISOString() })
      showToast('success', `已处理 ${uniqueTabs.length} 个页面`)
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || '整窗收进工作台失败')
    } finally {
      setActionLoading(prev => ({ ...prev, batchWorkspace: false }))
    }
  }

  async function handleBatchCloseAndArchive() {
    if (selectedOpenTabs.length === 0) return
    setActionLoading(prev => ({ ...prev, batchArchive: true }))
    let closed = 0
    try {
      for (const tab of selectedOpenTabs) {
        if (!tab.id) continue
        await requestTabAction({ type: 'CLOSE_AND_ARCHIVE', tabId: tab.id })
        closed++
        setOpenTabs(prev => prev.filter(item => item.id !== tab.id))
        setSelectedTabIds(prev => prev.filter(id => id !== tab.id))
        if (currentTab?.id === tab.id) setCurrentTab(null)
      }

      const selectedIdSet = new Set(selectedTabIds)
      const remainingTabs = openTabs.filter(tab => !tab.id || !selectedIdSet.has(tab.id))
      setOpenTabs(remainingTabs)
      if (currentTab?.id && selectedIdSet.has(currentTab.id)) {
        setCurrentTab(null)
        loadTabs()
      }
      clearSelection()
      showToast('success', `已关闭并归档 ${selectedOpenTabs.length} 个标签`)
    } catch (error) {
      loadTabs()
      showToast('error', `已归档 ${closed}/${selectedOpenTabs.length} 个，其余未完成：${errMsg(error)}`)
    } finally {
      setActionLoading(prev => ({ ...prev, batchArchive: false }))
    }
  }

  // ── SVG helpers ──────────────────────────────────────────
  function Ico({ d, size = 16, color = 'currentColor', strokeWidth = 2 }: { d: string[]; size?: number; color?: string; strokeWidth?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {d.map((path, i) => <path key={i} d={path} />)}
      </svg>
    )
  }

  const curFavicon = getRenderableFaviconUrl(currentTab?.favIconUrl)

  return (
    <div className="app">

      {/* ── Header ── */}
      <div className="pop-header">
        <img src="/icons/icon.svg" className="pop-logo" alt="" />
        <span className="pop-title">{brandName()}</span>
        <span className="pop-spacer" />
        <button className="pop-hdr-btn" title={isDark ? '切换亮色' : '切换暗色'} onClick={() => setIsDark(d => !d)}>
          {isDark
            ? <Ico d={['M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z']} size={14} />
            : <Ico d={['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']} size={14} />
          }
        </button>
        <button className="pop-hdr-btn" title="打开新标签页" onClick={() => { chrome.tabs.create({ url: 'chrome://newtab' }); window.close() }}>
          <Ico d={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z']} size={14} />
        </button>
        <button className="pop-hdr-btn" title="设置" onClick={() => { chrome.runtime.openOptionsPage(); window.close() }}>
          <Ico d={['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']} size={14} />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="pop-body">

        {/* ① 当前页 hero */}
        {isSupportedTab(currentTab) && (
          <div className="pop-hero">
            <div className="pop-hero-top">
              {curFavicon
                ? <img className="pop-hero-favicon" src={curFavicon} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                : <div className="pop-hero-favicon-ph" />}
              <div className="pop-hero-info">
                <div className="pop-hero-title">{getTabTitle(currentTab)}</div>
                <div className="pop-hero-url">{currentTab.url}</div>
              </div>
              <span className="pop-cur-badge">当前页</span>
            </div>
            <div className="pop-status-row">
              {currentQuickLink && (
                <span className="pop-chip pop-chip-green">已在导航{currentQuickLink.category ? ` · ${currentQuickLink.category}` : ''}</span>
              )}
              {currentBookmark && (
                <span className="pop-chip pop-chip-muted">已收藏{currentBookmark.folderPath ? ` · ${currentBookmark.folderPath}` : ''}</span>
              )}
              {!currentQuickLink && !currentBookmark && (
                <span className="pop-chip pop-chip-muted pop-chip-dim">还没收进你的工作台</span>
              )}
            </div>
            <div className="pop-hero-ctas">
              <button className="pop-cta-primary" onClick={handleSendCurrentToJustDoIt} disabled={actionLoading.inbox} title="把当前页发送到「倒计时321」工作台（收件箱），作为待办处理">
                <Ico d={['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z']} size={14} />
                {actionLoading.inbox ? '处理中...' : '当前页发到工作台'}
              </button>
              <button className="pop-cta-secondary" onClick={handleCaptureAllToWorkspace} disabled={actionLoading.batchWorkspace} title="整窗收进工作台">
                <Ico d={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z']} size={14} />
                {actionLoading.batchWorkspace ? '处理中...' : `整窗 · ${currentWindowTabs.length}`}
              </button>
            </div>
          </div>
        )}

        {!currentTab && (
          <div className="pop-page-hint">
            <strong>当前页无需收集</strong>
            <p>新标签页和浏览器设置页不会发送到工作台。你仍可在下方整理其他页面。</p>
          </div>
        )}

        {/* ② 智能动作：导航 + 书签 */}
        {isSupportedTab(currentTab) && !showQuickLinkPanel && !showBookmarkPanel && (
          <div className="pop-actions">
            <button className="pop-action-row" onClick={() => { void handleOpenQuickLinkPanel() }}>
              <span className="pop-action-icon" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
                <Ico d={['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M16.1 7.9 13.5 13.5 7.9 16.1 10.5 10.5Z']} size={16} color="#10b981" />
              </span>
              <div className="pop-action-info">
                <div className="pop-action-label">{currentQuickLink ? '调整导航分类' : '加入导航'}</div>
                <div className="pop-action-sub">
                  <span className="pop-action-target">{suggestedQuickLinkCategory || '默认'}</span>
                  <span className={`pop-action-badge${currentQuickLink ? ' hit' : ''}`}>{currentQuickLink ? '规则命中' : '推荐'}</span>
                </div>
              </div>
              <Ico d={['M9 18l6-6-6-6']} size={15} color="var(--text3)" />
            </button>
            <button className="pop-action-row" onClick={() => { void handleOpenBookmarkPanel() }}>
              <span className="pop-action-icon" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>
                <Ico d={['M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z']} size={16} color="#f59e0b" />
              </span>
              <div className="pop-action-info">
                <div className="pop-action-label">{currentBookmark ? '已收藏，换个文件夹' : '收藏书签'}</div>
                <div className="pop-action-sub">
                  <span className="pop-action-target">{preferredBookmarkFolderPath || '选择文件夹'}</span>
                  <span className={`pop-action-badge${bookmarkRecommendation.source === 'host' || bookmarkRecommendation.source === 'existing' ? ' hit' : ''}`}>
                    {bookmarkRecommendationLabel[bookmarkRecommendation.source]}
                  </span>
                </div>
              </div>
              <Ico d={['M9 18l6-6-6-6']} size={15} color="var(--text3)" />
            </button>
          </div>
        )}

        {/* 快速链接面板 */}
        {showQuickLinkPanel && (
          <div className="pop-subpanel">
            <div className="pop-subpanel-row">
              <label className="pop-field-label">导航标题</label>
              <input value={quickLinkTitle} onChange={e => setQuickLinkTitle(e.target.value)} placeholder="导航标题" />
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">搜索分类</label>
              <input value={quickLinkCategoryQuery} onChange={e => setQuickLinkCategoryQuery(e.target.value)} placeholder="搜索已有导航分类..." />
            </div>
            <div className="pop-folder-list">
              {filteredQuickLinkCategoryOptions.length > 0 ? (
                filteredQuickLinkCategoryOptions.map(category => (
                  <button key={category} className={`pop-folder-item${selectedQuickLinkCategory === category ? ' selected' : ''}`}
                    onClick={() => { setSelectedQuickLinkCategory(category); setNewQuickLinkCategory('') }} title={category}>
                    <span className="pop-folder-item-title">{category}</span>
                    {currentQuickLink?.category === category ? <span className="pop-folder-badge">当前</span>
                      : suggestedQuickLinkCategory === category ? <span className="pop-folder-badge">推荐</span>
                      : hostPreferredQuickLinkCategory === category ? <span className="pop-folder-badge">站点</span>
                      : null}
                  </button>
                ))
              ) : <div className="pop-folder-empty">没有匹配的分类，可在下方新建</div>}
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">新建分类（留空则用所选）</label>
              <input value={newQuickLinkCategory} onChange={e => setNewQuickLinkCategory(e.target.value)} placeholder="新分类名称" />
            </div>
            <div className="pop-subpanel-actions">
              <button className="pop-rule-btn pop-rule-btn-secondary" onClick={() => setShowQuickLinkPanel(false)}>取消</button>
              <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleAddCurrentToQuickLinks}
                disabled={actionLoading.quicklink || !(newQuickLinkCategory.trim() || selectedQuickLinkCategory)}>
                {actionLoading.quicklink ? '保存中...' : currentQuickLink ? '更新导航' : '保存导航'}
              </button>
            </div>
          </div>
        )}

        {/* 书签面板 */}
        {showBookmarkPanel && (
          <div className="pop-subpanel">
            <div className="pop-subpanel-row">
              <label className="pop-field-label">标题</label>
              <input value={bookmarkTitle} onChange={e => setBookmarkTitle(e.target.value)} placeholder="收藏标题" />
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">搜索文件夹</label>
              <input value={bookmarkFolderQuery} onChange={e => setBookmarkFolderQuery(e.target.value)} placeholder="搜索书签文件夹..." />
            </div>
            <div className="pop-folder-list">
              {filteredFolderOptions.length > 0 ? (
                filteredFolderOptions.map(folder => (
                  <button key={folder.id} className={`pop-folder-item${selectedFolderId === folder.id ? ' selected' : ''}`}
                    onClick={() => setSelectedFolderId(folder.id)} title={folder.path}>
                    <span className="pop-folder-item-title">{showFolderTitle(folder)}</span>
                    {recentFolderId === folder.id && <span className="pop-folder-badge">最近</span>}
                  </button>
                ))
              ) : <div className="pop-folder-empty">没有匹配的文件夹</div>}
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">新建子文件夹（留空则收藏到所选）</label>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="子文件夹名称" />
            </div>
            <div className="pop-subpanel-actions">
              <button className="pop-rule-btn pop-rule-btn-secondary" onClick={() => setShowBookmarkPanel(false)}>取消</button>
              <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleSaveCurrentBookmark}
                disabled={actionLoading.bookmark || !selectedFolderId}>
                {actionLoading.bookmark ? '保存中...' : '保存书签'}
              </button>
            </div>
          </div>
        )}

        {/* ③ 站点规则（折叠） */}
        {isSupportedTab(currentTab) && (
          <div className="pop-rules">
            <button className="pop-rules-toggle" onClick={() => setShowRulesLibrary(p => !p)}>
              <Ico d={['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.51 1.65 1.65 0 0 0 10 3V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']} size={14} color="var(--text3)" />
              <span className="pop-rules-title">站点规则</span>
              <span className="pop-rules-mode">
                {bookmarkRecommendationLabel[bookmarkRecommendation.source]}
              </span>
              <span style={{ flex: 1 }} />
              <Ico d={['M9 18l6-6-6-6']} size={14} color="var(--text3)" />
            </button>

            {showRulesLibrary && (
              <div className="pop-rules-body">
                <div className="pop-rule-grid">
                  {[['站点', currentHostname || '无法识别'], ['默认书签夹', preferredBookmarkFolderPath || '未设置'], ['导航分类', `${suggestedQuickLinkCategory}${hostPreferredQuickLinkCategory ? ' · 站点规则' : ' · 自动推断'}`]].map(([k, v]) => (
                    <div key={k} className="pop-rule-row">
                      <span className="pop-rule-key">{k}</span>
                      <span className="pop-rule-val">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="pop-rule-btns">
                  <button className="pop-rule-btn pop-rule-btn-primary" onClick={handlePinCurrentBookmarkRule}
                    disabled={!currentBookmark?.folderId || hostPreferredFolderId === currentBookmark.folderId}>
                    {hostPreferredFolderId === currentBookmark?.folderId ? '已记住收藏位置' : '记住当前收藏位置'}
                  </button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleOpenBookmarkPanel}>改默认文件夹</button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleClearCurrentBookmarkRule} disabled={!hostPreferredFolderId}>清除书签规则</button>
                  <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleRememberCurrentQuickLinkRule}
                    disabled={hostPreferredQuickLinkCategory === suggestedQuickLinkCategory}>
                    {hostPreferredQuickLinkCategory === suggestedQuickLinkCategory ? '已记住导航分类' : '记住导航分类'}
                  </button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleClearCurrentQuickLinkRule} disabled={!hostPreferredQuickLinkCategory}>清除导航规则</button>
                </div>

                {/* 规则库 */}
                <button className="pop-lib-toggle" onClick={() => { /* toggle lib inline */ }}>
                  <Ico d={['M9 18l6-6-6-6']} size={12} color="var(--text3)" />
                  规则库（书签 {bookmarkRuleSummaries.length} · 导航 {quickLinkRuleSummaries.length}）
                </button>
                <div className="pop-lib-search-row">
                  <div className="pop-lib-search">
                    <Ico d={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3']} size={12} color="var(--text3)" />
                    <input style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 11 }}
                      value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} placeholder="搜索站点 / 文件夹 / 分类" />
                  </div>
                  <button className="pop-lib-btn" onClick={handleExportRules}>导出</button>
                  <button className="pop-lib-btn" onClick={handleImportRulesClick}>导入</button>
                </div>
                <input ref={importRulesInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={e => { void handleImportRulesFileChange(e) }} />
                {filteredBookmarkRuleSummaries.map(rule => (
                  <div key={`${rule.hostname}-${rule.folderId}`} className="pop-rule-item">
                    <span className="pop-rule-type-badge" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>书签</span>
                    <span className="pop-rule-host">{rule.hostname}</span>
                    <span className="pop-rule-target">{rule.folderPath}</span>
                    <button className="pop-rule-x" onClick={() => { void handleRemoveRuleForHostname(rule.hostname) }} title="删除"><Ico d={['M18 6 6 18', 'M6 6l12 12']} size={11} /></button>
                  </div>
                ))}
                {filteredQuickLinkRuleSummaries.map(rule => (
                  <div key={`${rule.hostname}-${rule.category}`} className="pop-rule-item">
                    <span className="pop-rule-type-badge" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>导航</span>
                    <span className="pop-rule-host">{rule.hostname}</span>
                    <span className="pop-rule-target">{rule.category}</span>
                    <button className="pop-rule-x" onClick={() => { void handleRemoveQuickLinkRuleForHostname(rule.hostname) }} title="删除"><Ico d={['M18 6 6 18', 'M6 6l12 12']} size={11} /></button>
                  </div>
                ))}
                {filteredBookmarkRuleSummaries.length === 0 && filteredQuickLinkRuleSummaries.length === 0 && (
                  <div className="pop-rules-empty">暂无规则</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ④ 标签管理 */}
        <div className="pop-tabs-section">
          <div className="pop-tabs-head">
            <span className="pop-tabs-label">标签管理</span>
            <div className="pop-seg-ctrl">
              <button className={`pop-seg-btn${view === 'open' ? ' active' : ''}`} aria-pressed={view === 'open'} onClick={() => { setView('open'); setSelectedTabIds([]) }}>
                打开 {openTabs.length}
              </button>
              <button className={`pop-seg-btn${view === 'archived' ? ' active' : ''}`} aria-pressed={view === 'archived'} onClick={() => { setView('archived'); setSelectedTabIds([]) }}>
                归档 {archived.length}
              </button>
            </div>
          </div>

          <div className="pop-search">
            <Ico d={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3']} size={14} color="var(--text3)" />
            <input className="pop-search-input"
              aria-label={view === 'open' ? '搜索打开的标签' : '搜索归档记录'}
              placeholder={view === 'open' ? '搜索打开的标签...' : '搜索归档记录...'}
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>

          <div className="pop-tab-list">
            {view === 'open' ? (
              filteredOpen.length === 0 ? (
                <div className="pop-empty"><div className="pop-empty-icon">{query.trim() ? <SearchX size={26} strokeWidth={1.6} aria-hidden="true" /> : <PanelsTopLeft size={26} strokeWidth={1.6} aria-hidden="true" />}</div>{query.trim() ? '没有找到匹配的标签' : '当前窗口没有可整理的网页'}</div>
              ) : filteredOpen.map(tab => {
                const selected = typeof tab.id === 'number' && selectedTabIds.includes(tab.id)
                const favicon = getRenderableFaviconUrl(tab.favIconUrl)
                return (
                  <div key={tab.id} className={`pop-tab-row${selected ? ' selected' : ''}`}>
                    <input type="checkbox" className="pop-tab-checkbox" aria-label={`选择 ${getTabTitle(tab)}`}
                      checked={selected} onChange={e => typeof tab.id === 'number' && toggleTabSelection(tab.id, e.target.checked)} />
                    {favicon
                      ? <img className="pop-tab-favicon" src={favicon} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                      : <div className="pop-tab-favicon-ph" />}
                    <button className="pop-tab-info" onClick={() => switchToTab(tab)} title="切换到此标签页">
                      <span className="pop-tab-title">{tab.title || tab.url}</span>
                      <span className="pop-tab-url">{tab.url}</span>
                    </button>
                    {!selected && (
                      <div className="pop-tab-btns">
                        <button className="pop-tab-btn" onClick={e => { e.stopPropagation(); void archiveTab(tab) }} title="归档（保留标签）">
                          <Ico d={['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4']} size={13} />
                        </button>
                        <button className="pop-tab-btn danger" onClick={e => { e.stopPropagation(); void closeTab(tab) }} title="关闭标签页">
                          <Ico d={['M18 6 6 18', 'M6 6l12 12']} size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            ) : filteredArchived.length === 0 ? (
              <div className="pop-empty"><div className="pop-empty-icon">{query.trim() ? <SearchX size={26} strokeWidth={1.6} aria-hidden="true" /> : <Archive size={26} strokeWidth={1.6} aria-hidden="true" />}</div>{query.trim() ? '没有找到匹配的归档' : '暂无归档记录'}</div>
            ) : filteredArchived.map(tab => (
              <div key={tab.id} className="pop-tab-row">
                <div className="pop-tab-favicon-ph" />
                <button className="pop-tab-info" onClick={() => reopenArchived(tab)} title="重新打开此归档">
                  <span className="pop-tab-title">{tab.title}</span>
                  <span className="pop-tab-url">{tab.url}</span>
                  <span className="pop-tab-date">{formatDate(tab.archivedAt)}</span>
                </button>
                <div className="pop-tab-btns" style={{ opacity: 1 }}>
                  <button className="pop-tab-btn" onClick={e => { e.stopPropagation(); reopenArchived(tab) }} title="重新打开">
                    <Ico d={['M5 12h14', 'm12 5 7 7-7 7']} size={13} />
                  </button>
                  <button className="pop-tab-btn danger" onClick={e => { e.stopPropagation(); void deleteArchived(tab) }} title="删除记录">
                    <Ico d={['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M10 11v6', 'M14 11v6']} size={13} />
                  </button>
                </div>
              </div>
            ))}

            {searchedBookmarks.length > 0 && (
              <div className="pop-bm-section">
                <div className="pop-bm-section-label">原生书签</div>
                {searchedBookmarks.map(bm => (
                  <div key={bm.id} className="pop-tab-row" onClick={() => { chrome.tabs.create({ url: bm.url }); window.close() }}>
                    <div className="pop-tab-favicon-ph" />
                    <div className="pop-tab-info">
                      <div className="pop-tab-title" style={{ color: 'var(--accent)' }}>🔖 {bm.title}</div>
                      <div className="pop-tab-url">{bm.url}</div>
                    </div>
                    <div className="pop-tab-btns" style={{ opacity: 1 }}>
                      <button className="pop-tab-btn" title="在新标签打开"><Ico d={['M5 12h14', 'm12 5 7 7-7 7']} size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ⑤ Footer */}
      {selectedOpenTabs.length > 0 ? (
        <div className="pop-batch-footer">
          <div className="pop-batch-head">
            <span className="pop-batch-count">已选 <span>{selectedOpenTabs.length}</span> 个</span>
            <button className="pop-batch-link" onClick={() => updateSelection(filteredSelectableIds, true)}>全选</button>
            <button className="pop-batch-cancel" onClick={clearSelection}>取消</button>
          </div>
          <div className="pop-batch-actions">
            <button className="pop-batch-btn primary" onClick={handleBatchCaptureWorkspace} disabled={actionLoading.batchWorkspace}>
              {actionLoading.batchWorkspace ? '...' : '工作台'}
            </button>
            <button className="pop-batch-btn" onClick={handleBatchAddToQuickLinks} disabled={actionLoading.batchQuicklink}>
              {actionLoading.batchQuicklink ? '...' : '导航'}
            </button>
            <button className="pop-batch-btn" onClick={handleBatchBookmark} disabled={actionLoading.batchBookmark}>
              {actionLoading.batchBookmark ? '...' : '书签'}
            </button>
            <button className="pop-batch-btn danger" onClick={handleBatchCloseAndArchive} disabled={actionLoading.batchArchive}>
              {actionLoading.batchArchive ? '...' : '关闭归档'}
            </button>
          </div>
        </div>
      ) : (
        <div className="pop-footer">
          <button className="pop-toggle" title="开启后，每次执行操作（发送工作台 / 收藏 / 加入导航）会自动关闭此弹窗；关闭则保持打开以便连续操作" onClick={() => { void setCloseAfterActionPreference(!closeAfterAction) }}>
            <span className="pop-toggle-track" style={{ background: closeAfterAction ? 'var(--accent)' : 'var(--lg-stroke)' }}>
              <span className="pop-toggle-thumb" style={{ left: closeAfterAction ? 14 : 2 }} />
            </span>
            <span className="pop-toggle-label">完成后关闭</span>
          </button>
          <span style={{ flex: 1 }} />
          <button className="pop-foot-btn" onClick={exportMarkdown} title="导出 Markdown">
            <Ico d={['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z', 'M9 13h6', 'M9 17h3']} size={13} />
            MD
          </button>
          <button className="pop-foot-btn" onClick={exportJSON} title="导出 JSON">
            <Ico d={['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z']} size={13} />
            JSON
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`pop-toast pop-toast-${toast.tone}`}>{toast.text}</div>}
    </div>
  )
}
