import { useEffect, useMemo, useRef, useState } from 'react'
import { isBrowserContentUrl, tabsInWindow } from '../lib/page-url'
import { errMsg } from '../lib/errors'
import { brandName } from '../lib/brand'
import { Archive, PanelsTopLeft, SearchX } from 'lucide-react'
import { db } from '../lib/db'
import { ArchivedTab, QuickLink } from '../types'
import { sendToJustDoIt, extractMarkdownFromTab } from '../lib/justdoit'
import { requestTabAction } from '../lib/tab-actions'
import { localFaviconUrl } from '../lib/favicon'
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
import { categoryLabel, DEFAULT_CATEGORY_ID, inferPageCategory, inferPageCategoryId } from '../lib/page-category'
import { plural, t, uiLocale } from '../lib/i18n'
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
  return tab?.title?.trim() || tab?.url || t('popup_untitledPage')
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
  const [suggestedQuickLinkCategory, setSuggestedQuickLinkCategory] = useState(() => categoryLabel(DEFAULT_CATEGORY_ID))
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
  const [quickLinkCategoryOptions, setQuickLinkCategoryOptions] = useState<string[]>(() => [categoryLabel(DEFAULT_CATEGORY_ID)])
  const [quickLinkCategoryQuery, setQuickLinkCategoryQuery] = useState('')
  const [selectedQuickLinkCategory, setSelectedQuickLinkCategory] = useState(() => categoryLabel(DEFAULT_CATEGORY_ID))
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
    category: inferPageCategoryId(currentTab?.url || '', currentTab?.title || ''),
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
    return new Date(date).toLocaleTimeString(uiLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getRecentFolderShortLabel(path: string) {
    const parts = path.split(' / ').filter(Boolean)
    return parts[parts.length - 1] || t('popup_recentFolder')
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
      showToast('success', t('popup_toastArchivedKept'))
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errArchive'))
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
    const lines = [t('popup_markdownHeading', { brand: brandName() }), '', ...all.map(item => `- [${item.title}](${item.url})`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    chrome.downloads.download({ url, filename: 'djs321-tabs-export.md' })
  }

  function formatDate(date: Date) {
    return new Date(date).toLocaleDateString(uiLocale(), {
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
      category: inferPageCategoryId(currentTab?.url || '', currentTab?.title || ''),
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
    )).trim() || categoryLabel(DEFAULT_CATEGORY_ID)
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

    const order = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0

    const rawId = await db.quickLinks.add({
      url: tab.url || '',
      title,
      order,
      category,
    })
    const id = typeof rawId === 'number' ? rawId : undefined

    const createdQuickLink: QuickLink = {
      id,
      url: tab.url || '',
      title,
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
    showToast('success', t('popup_toastBookmarkRuleSaved'))
  }

  async function handleClearCurrentBookmarkRule() {
    if (!isSupportedTab(currentTab) || !currentHostname) return
    const nextPrefs = clearFolderPreferenceForUrl(bookmarkFolderPrefsRef.current, currentTab.url || '')
    await saveBookmarkFolderPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, recentFolderId)
    showToast('success', t('popup_toastBookmarkRuleCleared'))
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
    showToast('success', t('popup_toastQuickLinkRuleSaved'))
  }

  async function handleClearCurrentQuickLinkRule() {
    if (!isSupportedTab(currentTab) || !currentHostname) return
    const nextPrefs = clearQuickLinkCategoryPreferenceForUrl(quickLinkCategoryPrefsRef.current, currentTab.url || '')
    await saveQuickLinkCategoryPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, preferredBookmarkFolderId)
    showToast('success', t('popup_toastQuickLinkRuleCleared'))
  }

  async function handleApplyRuleFolderToCurrentSite(folderId: string) {
    if (!isSupportedTab(currentTab)) return
    const nextPrefs = rememberFolderPreferenceForUrl(bookmarkFolderPrefsRef.current, currentTab.url || '', folderId)
    await saveBookmarkFolderPrefs(nextPrefs)
    await refreshCurrentPageState(currentTab, folderId)
    showToast('success', t('popup_toastRuleApplied'))
  }

  async function handleRemoveRuleForHostname(hostname: string) {
    const { [hostname]: _removed, ...rest } = bookmarkFolderPrefsRef.current
    await saveBookmarkFolderPrefs(rest)
    if (currentHostname === hostname && isSupportedTab(currentTab)) {
      await refreshCurrentPageState(currentTab, recentFolderId)
    }
    showToast('success', t('popup_toastRuleDeleted'))
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
    showToast('success', t('popup_toastQuickLinkRuleApplied'))
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
    showToast('success', t('popup_toastQuickLinkRuleDeleted'))
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
      showToast('success', t('popup_toastRulesExported'))
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errExportRules'))
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
        t('popup_toastRulesImported', {
          bookmarkCount: Object.keys(snapshot.bookmarkFolderPrefs).length,
          quickLinkCount: Object.keys(snapshot.quickLinkCategoryPrefs).length,
        }),
      )
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errImportRules'))
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
        detail: created ? t('popup_detailInboxAndQuickLink') : t('popup_detailInbox'),
        at: new Date().toISOString(),
      })
      showToast('success', created ? t('popup_toastSentToInboxAndQuickLink') : t('popup_toastSentToInbox'))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errAction'))
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
        detail: t('popup_detailSendToInbox'),
        at: new Date().toISOString(),
      })
      showToast('success', t('popup_toastSentToAppInbox'))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errSend'))
    } finally {
      setActionLoading(prev => ({ ...prev, inbox: false }))
    }
  }

  async function handleOpenQuickLinkPanel() {
    if (!isSupportedTab(currentTab)) return
    const quickLinks = await db.quickLinks.toArray()
    const category = currentQuickLink?.category || suggestedQuickLinkCategory || categoryLabel(DEFAULT_CATEGORY_ID)
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
    const category = (newQuickLinkCategory.trim() || selectedQuickLinkCategory || suggestedQuickLinkCategory || categoryLabel(DEFAULT_CATEGORY_ID)).trim()
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
        detail: quickLink.category || categoryLabel(DEFAULT_CATEGORY_ID),
        at: new Date().toISOString(),
      })
      const categoryText = quickLink.category || categoryLabel(DEFAULT_CATEGORY_ID)
      showToast(
        'success',
        created
          ? t('popup_toastQuickLinkAdded', { category: categoryText })
          : updated
            ? t('popup_toastQuickLinkCategoryUpdated', { category: categoryText })
            : t('popup_toastQuickLinkKept', { category: categoryText }),
      )
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errAddQuickLink'))
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
        detail: result.folderPath || t('popup_detailBookmark'),
        at: new Date().toISOString(),
      })
      showToast('success', result.updated ? t('popup_toastBookmarkUpdated') : t('popup_toastBookmarkAdded'))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errBookmark'))
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
        detail: result.folderPath || t('popup_detailBookmark'),
        at: new Date().toISOString(),
      })
      showToast('success', result.updated ? t('popup_toastDefaultBookmarkUpdated') : t('popup_toastSavedToDefaultFolder'))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errQuickSave'))
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
        showToast('info', t('popup_toastNoDefaultFolder'))
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
        title: plural('popup_pageCount_one', 'popup_pageCount_other', processed),
        url: groups[0]?.tabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail:
          skippedCount > 0 || duplicateCount > 0
            ? plural('popup_detailBatchBookmarkSkipped_one', 'popup_detailBatchBookmarkSkipped_other', skippedCount + duplicateCount)
            : t('popup_detailBatchBookmark'),
        at: new Date().toISOString(),
      })
      clearSelection()
      showToast('success', updatedCount > 0
        ? t('popup_toastBatchBookmarkUpdated', { processed, updated: updatedCount })
        : plural('popup_toastBatchBookmarked_one', 'popup_toastBatchBookmarked_other', processed))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errBatchBookmark'))
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
        title: plural('popup_pageCount_one', 'popup_pageCount_other', uniqueTabs.length),
        url: uniqueTabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail: creatableTabs.length > 0
          ? plural('popup_detailBatchWorkspaceAdded_one', 'popup_detailBatchWorkspaceAdded_other', creatableTabs.length)
          : t('popup_detailBatchInbox'),
        at: new Date().toISOString(),
      })
      showToast('success', plural('popup_toastProcessedPages_one', 'popup_toastProcessedPages_other', uniqueTabs.length))
      clearSelection()
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errBatchWorkspace'))
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
        showToast('info', existingCount > 0 || duplicateCount > 0 ? t('popup_toastAllAlreadyQuickLinks') : t('popup_toastNothingToAdd'))
        return
      }

      const baseOrder = quickLinks.length > 0 ? Math.max(...quickLinks.map(link => link.order)) + 1 : 0
      await db.quickLinks.bulkAdd(
        creatableTabs.map((tab, index) => {
          return {
            url: tab.url || '',
            title: getTabTitle(tab),
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
        title: plural('popup_pageCount_one', 'popup_pageCount_other', creatableTabs.length),
        url: creatableTabs[0]?.url || currentTab?.url || 'https://localhost.invalid/tab-butler-batch',
        detail: existingCount > 0
          ? plural('popup_detailBatchQuickLinkSkipped_one', 'popup_detailBatchQuickLinkSkipped_other', existingCount + duplicateCount)
          : t('popup_detailBatchQuickLink'),
        at: new Date().toISOString(),
      })
      showToast('success', plural('popup_toastBatchQuickLinkAdded_one', 'popup_toastBatchQuickLinkAdded_other', creatableTabs.length))
      clearSelection()
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errBatchQuickLink'))
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
            order: baseOrder + index,
            category: resolvePreferredQuickLinkCategoryForUrl(tab.url || '', quickLinkCategoryPrefsRef.current, inferQuickLinkCategory(tab, quickLinks)),
          })),
        )
      }
      if (isSupportedTab(currentTab)) await refreshCurrentPageState(currentTab)
      await recordRecentAction({ type: 'workspace', title: plural('popup_pageCount_one', 'popup_pageCount_other', uniqueTabs.length), url: uniqueTabs[0]?.url || '', detail: t('popup_detailWindowToWorkspace'), at: new Date().toISOString() })
      showToast('success', plural('popup_toastProcessedPages_one', 'popup_toastProcessedPages_other', uniqueTabs.length))
      closePopupSoon()
    } catch (error) {
      showToast('error', errMsg(error) || t('popup_errWindowToWorkspace'))
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
      showToast('success', plural('popup_toastClosedArchived_one', 'popup_toastClosedArchived_other', selectedOpenTabs.length))
    } catch (error) {
      loadTabs()
      showToast('error', t('popup_errPartialArchive', { closed, total: selectedOpenTabs.length, error: errMsg(error) || '' }))
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

  const curFavicon = localFaviconUrl(currentTab?.url)
  // 计数要单独加粗，按 {count} 把文案切成前后两段
  const [selectedCountBefore = '', selectedCountAfter = ''] = t('popup_selectedCount').split('{count}')

  return (
    <div className="app">

      {/* ── Header ── */}
      <div className="pop-header">
        <img src="/icons/icon.svg" className="pop-logo" alt="" />
        <span className="pop-title">{brandName()}</span>
        <span className="pop-spacer" />
        <button className="pop-hdr-btn" title={isDark ? t('popup_switchToLight') : t('popup_switchToDark')} onClick={() => setIsDark(d => !d)}>
          {isDark
            ? <Ico d={['M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z']} size={14} />
            : <Ico d={['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']} size={14} />
          }
        </button>
        <button className="pop-hdr-btn" title={t('popup_openNewTab')} onClick={() => { chrome.tabs.create({ url: 'chrome://newtab' }); window.close() }}>
          <Ico d={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z']} size={14} />
        </button>
        <button className="pop-hdr-btn" title={t('popup_settings')} onClick={() => { chrome.runtime.openOptionsPage(); window.close() }}>
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
              <span className="pop-cur-badge">{t('popup_currentPageBadge')}</span>
            </div>
            <div className="pop-status-row">
              {currentQuickLink && (
                <span className="pop-chip pop-chip-green">{t('popup_chipInQuickLinks')}{currentQuickLink.category ? ` · ${currentQuickLink.category}` : ''}</span>
              )}
              {currentBookmark && (
                <span className="pop-chip pop-chip-muted">{t('popup_chipBookmarked')}{currentBookmark.folderPath ? ` · ${currentBookmark.folderPath}` : ''}</span>
              )}
              {!currentQuickLink && !currentBookmark && (
                <span className="pop-chip pop-chip-muted pop-chip-dim">{t('popup_chipNotCaptured')}</span>
              )}
            </div>
            <div className="pop-hero-ctas">
              <button className="pop-cta-primary" onClick={handleSendCurrentToJustDoIt} disabled={actionLoading.inbox} title={t('popup_sendCurrentTitle')}>
                <Ico d={['M22 2 11 13', 'M22 2 15 22l-4-9-9-4z']} size={14} />
                {actionLoading.inbox ? t('common_processing') : t('popup_sendCurrent')}
              </button>
              <button className="pop-cta-secondary" onClick={handleCaptureAllToWorkspace} disabled={actionLoading.batchWorkspace} title={t('popup_captureWindowTitle')}>
                <Ico d={['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z']} size={14} />
                {actionLoading.batchWorkspace ? t('common_processing') : t('popup_captureWindow', { count: currentWindowTabs.length })}
              </button>
            </div>
          </div>
        )}

        {!currentTab && (
          <div className="pop-page-hint">
            <strong>{t('popup_noCaptureTitle')}</strong>
            <p>{t('popup_noCaptureBody')}</p>
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
                <div className="pop-action-label">{currentQuickLink ? t('popup_adjustQuickLinkCategory') : t('popup_addToQuickLinks')}</div>
                <div className="pop-action-sub">
                  <span className="pop-action-target">{suggestedQuickLinkCategory || categoryLabel(DEFAULT_CATEGORY_ID)}</span>
                  <span className={`pop-action-badge${currentQuickLink ? ' hit' : ''}`}>{currentQuickLink ? t('popup_badgeRuleHit') : t('popup_badgeSuggested')}</span>
                </div>
              </div>
              <Ico d={['M9 18l6-6-6-6']} size={15} color="var(--text3)" />
            </button>
            <button className="pop-action-row" onClick={() => { void handleOpenBookmarkPanel() }}>
              <span className="pop-action-icon" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>
                <Ico d={['M5 3h14a1 1 0 0 1 1 1v17l-8-4-8 4V4a1 1 0 0 1 1-1z']} size={16} color="#f59e0b" />
              </span>
              <div className="pop-action-info">
                <div className="pop-action-label">{currentBookmark ? t('popup_bookmarkedChangeFolder') : t('popup_bookmarkPage')}</div>
                <div className="pop-action-sub">
                  <span className="pop-action-target">{preferredBookmarkFolderPath || t('popup_chooseFolder')}</span>
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
              <label className="pop-field-label">{t('popup_quickLinkTitle')}</label>
              <input value={quickLinkTitle} onChange={e => setQuickLinkTitle(e.target.value)} placeholder={t('popup_quickLinkTitle')} />
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">{t('popup_searchCategories')}</label>
              <input value={quickLinkCategoryQuery} onChange={e => setQuickLinkCategoryQuery(e.target.value)} placeholder={t('popup_searchCategoriesPlaceholder')} />
            </div>
            <div className="pop-folder-list">
              {filteredQuickLinkCategoryOptions.length > 0 ? (
                filteredQuickLinkCategoryOptions.map(category => (
                  <button key={category} className={`pop-folder-item${selectedQuickLinkCategory === category ? ' selected' : ''}`}
                    onClick={() => { setSelectedQuickLinkCategory(category); setNewQuickLinkCategory('') }} title={category}>
                    <span className="pop-folder-item-title">{category}</span>
                    {currentQuickLink?.category === category ? <span className="pop-folder-badge">{t('popup_badgeCurrent')}</span>
                      : suggestedQuickLinkCategory === category ? <span className="pop-folder-badge">{t('popup_badgeSuggested')}</span>
                      : hostPreferredQuickLinkCategory === category ? <span className="pop-folder-badge">{t('popup_badgeSite')}</span>
                      : null}
                  </button>
                ))
              ) : <div className="pop-folder-empty">{t('popup_noMatchingCategory')}</div>}
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">{t('popup_newCategoryLabel')}</label>
              <input value={newQuickLinkCategory} onChange={e => setNewQuickLinkCategory(e.target.value)} placeholder={t('popup_newCategoryPlaceholder')} />
            </div>
            <div className="pop-subpanel-actions">
              <button className="pop-rule-btn pop-rule-btn-secondary" onClick={() => setShowQuickLinkPanel(false)}>{t('common_cancel')}</button>
              <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleAddCurrentToQuickLinks}
                disabled={actionLoading.quicklink || !(newQuickLinkCategory.trim() || selectedQuickLinkCategory)}>
                {actionLoading.quicklink ? t('common_saving') : currentQuickLink ? t('popup_updateQuickLink') : t('popup_saveQuickLink')}
              </button>
            </div>
          </div>
        )}

        {/* 书签面板 */}
        {showBookmarkPanel && (
          <div className="pop-subpanel">
            <div className="pop-subpanel-row">
              <label className="pop-field-label">{t('popup_titleLabel')}</label>
              <input value={bookmarkTitle} onChange={e => setBookmarkTitle(e.target.value)} placeholder={t('popup_bookmarkTitlePlaceholder')} />
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">{t('popup_searchFolders')}</label>
              <input value={bookmarkFolderQuery} onChange={e => setBookmarkFolderQuery(e.target.value)} placeholder={t('popup_searchFoldersPlaceholder')} />
            </div>
            <div className="pop-folder-list">
              {filteredFolderOptions.length > 0 ? (
                filteredFolderOptions.map(folder => (
                  <button key={folder.id} className={`pop-folder-item${selectedFolderId === folder.id ? ' selected' : ''}`}
                    onClick={() => setSelectedFolderId(folder.id)} title={folder.path}>
                    <span className="pop-folder-item-title">{showFolderTitle(folder)}</span>
                    {recentFolderId === folder.id && <span className="pop-folder-badge">{t('popup_badgeRecent')}</span>}
                  </button>
                ))
              ) : <div className="pop-folder-empty">{t('popup_noMatchingFolder')}</div>}
            </div>
            <div className="pop-subpanel-row">
              <label className="pop-field-label">{t('popup_newSubfolderLabel')}</label>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder={t('popup_subfolderPlaceholder')} />
            </div>
            <div className="pop-subpanel-actions">
              <button className="pop-rule-btn pop-rule-btn-secondary" onClick={() => setShowBookmarkPanel(false)}>{t('common_cancel')}</button>
              <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleSaveCurrentBookmark}
                disabled={actionLoading.bookmark || !selectedFolderId}>
                {actionLoading.bookmark ? t('common_saving') : t('popup_saveBookmark')}
              </button>
            </div>
          </div>
        )}

        {/* ③ 站点规则（折叠） */}
        {isSupportedTab(currentTab) && (
          <div className="pop-rules">
            <button className="pop-rules-toggle" onClick={() => setShowRulesLibrary(p => !p)}>
              <Ico d={['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.51 1.65 1.65 0 0 0 10 3V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']} size={14} color="var(--text3)" />
              <span className="pop-rules-title">{t('popup_siteRules')}</span>
              <span className="pop-rules-mode">
                {bookmarkRecommendationLabel[bookmarkRecommendation.source]}
              </span>
              <span style={{ flex: 1 }} />
              <Ico d={['M9 18l6-6-6-6']} size={14} color="var(--text3)" />
            </button>

            {showRulesLibrary && (
              <div className="pop-rules-body">
                <div className="pop-rule-grid">
                  {[[t('popup_ruleSite'), currentHostname || t('popup_unrecognized')], [t('popup_ruleDefaultFolder'), preferredBookmarkFolderPath || t('popup_notSet')], [t('popup_ruleQuickLinkCategory'), `${suggestedQuickLinkCategory} · ${hostPreferredQuickLinkCategory ? t('popup_ruleFromSite') : t('popup_ruleAutoInferred')}`]].map(([k, v]) => (
                    <div key={k} className="pop-rule-row">
                      <span className="pop-rule-key">{k}</span>
                      <span className="pop-rule-val">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="pop-rule-btns">
                  <button className="pop-rule-btn pop-rule-btn-primary" onClick={handlePinCurrentBookmarkRule}
                    disabled={!currentBookmark?.folderId || hostPreferredFolderId === currentBookmark.folderId}>
                    {hostPreferredFolderId === currentBookmark?.folderId ? t('popup_bookmarkLocationSaved') : t('popup_rememberBookmarkLocation')}
                  </button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleOpenBookmarkPanel}>{t('popup_changeDefaultFolder')}</button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleClearCurrentBookmarkRule} disabled={!hostPreferredFolderId}>{t('popup_clearBookmarkRule')}</button>
                  <button className="pop-rule-btn pop-rule-btn-primary" onClick={handleRememberCurrentQuickLinkRule}
                    disabled={hostPreferredQuickLinkCategory === suggestedQuickLinkCategory}>
                    {hostPreferredQuickLinkCategory === suggestedQuickLinkCategory ? t('popup_quickLinkCategorySaved') : t('popup_rememberQuickLinkCategory')}
                  </button>
                  <button className="pop-rule-btn pop-rule-btn-secondary" onClick={handleClearCurrentQuickLinkRule} disabled={!hostPreferredQuickLinkCategory}>{t('popup_clearQuickLinkRule')}</button>
                </div>

                {/* 规则库 */}
                <button className="pop-lib-toggle" onClick={() => { /* toggle lib inline */ }}>
                  <Ico d={['M9 18l6-6-6-6']} size={12} color="var(--text3)" />
                  {t('popup_ruleLibrary', { bookmarkCount: bookmarkRuleSummaries.length, quickLinkCount: quickLinkRuleSummaries.length })}
                </button>
                <div className="pop-lib-search-row">
                  <div className="pop-lib-search">
                    <Ico d={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3']} size={12} color="var(--text3)" />
                    <input style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 11 }}
                      value={ruleSearch} onChange={e => setRuleSearch(e.target.value)} placeholder={t('popup_searchRulesPlaceholder')} />
                  </div>
                  <button className="pop-lib-btn" onClick={handleExportRules}>{t('common_export')}</button>
                  <button className="pop-lib-btn" onClick={handleImportRulesClick}>{t('common_import')}</button>
                </div>
                <input ref={importRulesInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={e => { void handleImportRulesFileChange(e) }} />
                {filteredBookmarkRuleSummaries.map(rule => (
                  <div key={`${rule.hostname}-${rule.folderId}`} className="pop-rule-item">
                    <span className="pop-rule-type-badge" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}>{t('popup_ruleTypeBookmark')}</span>
                    <span className="pop-rule-host">{rule.hostname}</span>
                    <span className="pop-rule-target">{rule.folderPath}</span>
                    <button className="pop-rule-x" onClick={() => { void handleRemoveRuleForHostname(rule.hostname) }} title={t('common_delete')}><Ico d={['M18 6 6 18', 'M6 6l12 12']} size={11} /></button>
                  </div>
                ))}
                {filteredQuickLinkRuleSummaries.map(rule => (
                  <div key={`${rule.hostname}-${rule.category}`} className="pop-rule-item">
                    <span className="pop-rule-type-badge" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>{t('popup_ruleTypeQuickLink')}</span>
                    <span className="pop-rule-host">{rule.hostname}</span>
                    <span className="pop-rule-target">{rule.category}</span>
                    <button className="pop-rule-x" onClick={() => { void handleRemoveQuickLinkRuleForHostname(rule.hostname) }} title={t('common_delete')}><Ico d={['M18 6 6 18', 'M6 6l12 12']} size={11} /></button>
                  </div>
                ))}
                {filteredBookmarkRuleSummaries.length === 0 && filteredQuickLinkRuleSummaries.length === 0 && (
                  <div className="pop-rules-empty">{t('popup_noRules')}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ④ 标签管理 */}
        <div className="pop-tabs-section">
          <div className="pop-tabs-head">
            <span className="pop-tabs-label">{t('popup_tabManager')}</span>
            <div className="pop-seg-ctrl">
              <button className={`pop-seg-btn${view === 'open' ? ' active' : ''}`} aria-pressed={view === 'open'} onClick={() => { setView('open'); setSelectedTabIds([]) }}>
                {t('popup_openCount', { count: openTabs.length })}
              </button>
              <button className={`pop-seg-btn${view === 'archived' ? ' active' : ''}`} aria-pressed={view === 'archived'} onClick={() => { setView('archived'); setSelectedTabIds([]) }}>
                {t('popup_archivedCount', { count: archived.length })}
              </button>
            </div>
          </div>

          <div className="pop-search">
            <Ico d={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3']} size={14} color="var(--text3)" />
            <input className="pop-search-input"
              aria-label={view === 'open' ? t('popup_searchOpenTabs') : t('popup_searchArchive')}
              placeholder={view === 'open' ? t('popup_searchOpenTabsPlaceholder') : t('popup_searchArchivePlaceholder')}
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>

          <div className="pop-tab-list">
            {view === 'open' ? (
              filteredOpen.length === 0 ? (
                <div className="pop-empty"><div className="pop-empty-icon">{query.trim() ? <SearchX size={26} strokeWidth={1.6} aria-hidden="true" /> : <PanelsTopLeft size={26} strokeWidth={1.6} aria-hidden="true" />}</div>{query.trim() ? t('popup_noMatchingTabs') : t('popup_noTabsInWindow')}</div>
              ) : filteredOpen.map(tab => {
                const selected = typeof tab.id === 'number' && selectedTabIds.includes(tab.id)
                const favicon = localFaviconUrl(tab.url)
                return (
                  <div key={tab.id} className={`pop-tab-row${selected ? ' selected' : ''}`}>
                    <input type="checkbox" className="pop-tab-checkbox" aria-label={t('popup_selectTab', { title: getTabTitle(tab) })}
                      checked={selected} onChange={e => typeof tab.id === 'number' && toggleTabSelection(tab.id, e.target.checked)} />
                    {favicon
                      ? <img className="pop-tab-favicon" src={favicon} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                      : <div className="pop-tab-favicon-ph" />}
                    <button className="pop-tab-info" onClick={() => switchToTab(tab)} title={t('popup_switchToTab')}>
                      <span className="pop-tab-title">{tab.title || tab.url}</span>
                      <span className="pop-tab-url">{tab.url}</span>
                    </button>
                    {!selected && (
                      <div className="pop-tab-btns">
                        <button className="pop-tab-btn" onClick={e => { e.stopPropagation(); void archiveTab(tab) }} title={t('popup_archiveKeepTab')}>
                          <Ico d={['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4']} size={13} />
                        </button>
                        <button className="pop-tab-btn danger" onClick={e => { e.stopPropagation(); void closeTab(tab) }} title={t('popup_closeTab')}>
                          <Ico d={['M18 6 6 18', 'M6 6l12 12']} size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            ) : filteredArchived.length === 0 ? (
              <div className="pop-empty"><div className="pop-empty-icon">{query.trim() ? <SearchX size={26} strokeWidth={1.6} aria-hidden="true" /> : <Archive size={26} strokeWidth={1.6} aria-hidden="true" />}</div>{query.trim() ? t('popup_noMatchingArchive') : t('popup_noArchive')}</div>
            ) : filteredArchived.map(tab => (
              <div key={tab.id} className="pop-tab-row">
                <div className="pop-tab-favicon-ph" />
                <button className="pop-tab-info" onClick={() => reopenArchived(tab)} title={t('popup_reopenArchivedTitle')}>
                  <span className="pop-tab-title">{tab.title}</span>
                  <span className="pop-tab-url">{tab.url}</span>
                  <span className="pop-tab-date">{formatDate(tab.archivedAt)}</span>
                </button>
                <div className="pop-tab-btns" style={{ opacity: 1 }}>
                  <button className="pop-tab-btn" onClick={e => { e.stopPropagation(); reopenArchived(tab) }} title={t('popup_reopen')}>
                    <Ico d={['M5 12h14', 'm12 5 7 7-7 7']} size={13} />
                  </button>
                  <button className="pop-tab-btn danger" onClick={e => { e.stopPropagation(); void deleteArchived(tab) }} title={t('popup_deleteRecord')}>
                    <Ico d={['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M10 11v6', 'M14 11v6']} size={13} />
                  </button>
                </div>
              </div>
            ))}

            {searchedBookmarks.length > 0 && (
              <div className="pop-bm-section">
                <div className="pop-bm-section-label">{t('popup_browserBookmarks')}</div>
                {searchedBookmarks.map(bm => (
                  <div key={bm.id} className="pop-tab-row" onClick={() => { chrome.tabs.create({ url: bm.url }); window.close() }}>
                    <div className="pop-tab-favicon-ph" />
                    <div className="pop-tab-info">
                      <div className="pop-tab-title" style={{ color: 'var(--accent)' }}>🔖 {bm.title}</div>
                      <div className="pop-tab-url">{bm.url}</div>
                    </div>
                    <div className="pop-tab-btns" style={{ opacity: 1 }}>
                      <button className="pop-tab-btn" title={t('popup_openInNewTab')}><Ico d={['M5 12h14', 'm12 5 7 7-7 7']} size={13} /></button>
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
            <span className="pop-batch-count">{selectedCountBefore}<span>{selectedOpenTabs.length}</span>{selectedCountAfter}</span>
            <button className="pop-batch-link" onClick={() => updateSelection(filteredSelectableIds, true)}>{t('popup_selectAll')}</button>
            <button className="pop-batch-cancel" onClick={clearSelection}>{t('common_cancel')}</button>
          </div>
          <div className="pop-batch-actions">
            <button className="pop-batch-btn primary" onClick={handleBatchCaptureWorkspace} disabled={actionLoading.batchWorkspace}>
              {actionLoading.batchWorkspace ? '...' : t('popup_batchWorkspace')}
            </button>
            <button className="pop-batch-btn" onClick={handleBatchAddToQuickLinks} disabled={actionLoading.batchQuicklink}>
              {actionLoading.batchQuicklink ? '...' : t('popup_batchQuickLink')}
            </button>
            <button className="pop-batch-btn" onClick={handleBatchBookmark} disabled={actionLoading.batchBookmark}>
              {actionLoading.batchBookmark ? '...' : t('popup_batchBookmark')}
            </button>
            <button className="pop-batch-btn danger" onClick={handleBatchCloseAndArchive} disabled={actionLoading.batchArchive}>
              {actionLoading.batchArchive ? '...' : t('popup_batchCloseArchive')}
            </button>
          </div>
        </div>
      ) : (
        <div className="pop-footer">
          <button className="pop-toggle" title={t('popup_closeAfterActionTitle')} onClick={() => { void setCloseAfterActionPreference(!closeAfterAction) }}>
            <span className="pop-toggle-track" style={{ background: closeAfterAction ? 'var(--accent)' : 'var(--lg-stroke)' }}>
              <span className="pop-toggle-thumb" style={{ left: closeAfterAction ? 14 : 2 }} />
            </span>
            <span className="pop-toggle-label">{t('popup_closeAfterAction')}</span>
          </button>
          <span style={{ flex: 1 }} />
          <button className="pop-foot-btn" onClick={exportMarkdown} title={t('popup_exportMarkdown')}>
            <Ico d={['M14 3v4a1 1 0 0 0 1 1h4', 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z', 'M9 13h6', 'M9 17h3']} size={13} />
            MD
          </button>
          <button className="pop-foot-btn" onClick={exportJSON} title={t('popup_exportJson')}>
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
