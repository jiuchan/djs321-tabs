import { getUrlHostname, urlsMatch } from './helpers.ts'
import type { BookmarkFolderOption, BookmarkFolderPreferenceMap, BookmarkMatch } from './helpers.ts'
import { t } from '../lib/i18n.ts'
import type { PageCategoryId } from '../lib/page-category.ts'

export interface BookmarkRecommendationInput {
  url: string
  title?: string
  folders: BookmarkFolderOption[]
  bookmarks: BookmarkMatch[]
  preferences: BookmarkFolderPreferenceMap
  recentFolderId?: string | null
  category: PageCategoryId
}

export type BookmarkRecommendationSource = 'host' | 'existing' | 'same-site' | 'content' | 'recent' | 'none'

export interface BookmarkRecommendation {
  folderId: string | null
  source: BookmarkRecommendationSource
}

export const bookmarkRecommendationLabel: Record<BookmarkRecommendationSource, string> = {
  host: t('popup_recSourceHost'), existing: t('popup_recSourceExisting'), 'same-site': t('popup_recSourceSameSite'),
  content: t('popup_recSourceContent'), recent: t('popup_recSourceRecent'), none: t('popup_recSourceNone'),
}

// 按分类 id 匹配用户书签文件夹名（中英文都认）
const FOLDER_ALIASES: Partial<Record<PageCategoryId, RegExp>> = {
  ai: /\b(?:AI|LLM|ChatGPT|Claude)\b|人工智能|大模型|智能体|提示词/i, // i18n-allow: 匹配书签文件夹名
  dev: /开发|编程|代码|\b(?:dev|development|coding|programming)\b/i, // i18n-allow: 匹配书签文件夹名
  cloud: /云服务|运维|服务器|\b(?:cloud|devops|hosting)\b/i, // i18n-allow: 匹配书签文件夹名
  design: /设计|素材|\b(?:design|assets)\b/i, // i18n-allow: 匹配书签文件夹名
  finance: /金融|理财|投资|\b(?:finance|investing)\b/i, // i18n-allow: 匹配书签文件夹名
  video: /视频|影视|\b(?:video|movies)\b/i, // i18n-allow: 匹配书签文件夹名
  news: /资讯|新闻|阅读|\b(?:news|reading)\b/i, // i18n-allow: 匹配书签文件夹名
  geek: /极客|技术社区|\b(?:geek|community)\b/i, // i18n-allow: 匹配书签文件夹名
  shopping: /购物|电商|\b(?:shopping|commerce)\b/i, // i18n-allow: 匹配书签文件夹名
  social: /社交|沟通|\b(?:social|communication)\b/i, // i18n-allow: 匹配书签文件夹名
  music: /音乐|\bmusic\b/i, // i18n-allow: 匹配书签文件夹名
  mail: /邮件|邮箱|\b(?:mail|email)\b/i, // i18n-allow: 匹配书签文件夹名
  docs: /文档|协作|\b(?:docs|documents|collaboration)\b/i, // i18n-allow: 匹配书签文件夹名
}

export function collectBookmarkMatches(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkMatch[] {
  return nodes.flatMap(node => node.url
    ? [{ id: node.id, title: node.title, url: node.url, parentId: node.parentId }]
    : collectBookmarkMatches(node.children || []))
}

export function recommendBookmarkFolder(input: BookmarkRecommendationInput): BookmarkRecommendation {
  const validIds = new Set(input.folders.map(folder => folder.id))
  const hostname = getUrlHostname(input.url)
  const ruleId = hostname && input.preferences[hostname]
  if (ruleId && validIds.has(ruleId)) return { folderId: ruleId, source: 'host' }

  const bookmarks = input.bookmarks.filter(bookmark => bookmark.parentId && validIds.has(bookmark.parentId))
  const uniqueParent = (matches: BookmarkMatch[]) => {
    const ids = new Set(matches.map(bookmark => bookmark.parentId!))
    return ids.size === 1 ? [...ids][0] : null
  }
  const exactId = uniqueParent(bookmarks.filter(bookmark => bookmark.url && urlsMatch(bookmark.url, input.url)))
  if (exactId) return { folderId: exactId, source: 'existing' }
  const sameSiteId = hostname && uniqueParent(bookmarks.filter(bookmark => bookmark.url && getUrlHostname(bookmark.url) === hostname))
  if (sameSiteId) return { folderId: sameSiteId, source: 'same-site' }

  const aliases = FOLDER_ALIASES[input.category]
  // A parent named AI must not make every unrelated child a matching destination.
  const contentFolders = aliases ? input.folders.filter(folder => aliases.test(folder.title)) : []
  if (contentFolders.length === 1) return { folderId: contentFolders[0].id, source: 'content' }
  if (input.recentFolderId && validIds.has(input.recentFolderId)) return { folderId: input.recentFolderId, source: 'recent' }
  return { folderId: null, source: 'none' }
}
