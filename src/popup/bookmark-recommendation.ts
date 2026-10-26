import { getUrlHostname, urlsMatch } from './helpers.ts'
import type { BookmarkFolderOption, BookmarkFolderPreferenceMap, BookmarkMatch } from './helpers.ts'

export interface BookmarkRecommendationInput {
  url: string
  title?: string
  folders: BookmarkFolderOption[]
  bookmarks: BookmarkMatch[]
  preferences: BookmarkFolderPreferenceMap
  recentFolderId?: string | null
  category: string
}

export type BookmarkRecommendationSource = 'host' | 'existing' | 'same-site' | 'content' | 'recent' | 'none'

export interface BookmarkRecommendation {
  folderId: string | null
  source: BookmarkRecommendationSource
}

export const bookmarkRecommendationLabel: Record<BookmarkRecommendationSource, string> = {
  host: '站点规则', existing: '已收藏', 'same-site': '同站收藏',
  content: '内容匹配', recent: '最近使用', none: '待选择',
}

const FOLDER_ALIASES: Record<string, RegExp> = {
  '🤖 AI 助手': /\b(?:AI|LLM|ChatGPT|Claude)\b|人工智能|大模型|智能体|提示词/i,
  '💻 开发工具': /开发|编程|代码|\b(?:dev|development|coding|programming)\b/i,
  '☁️ 云服务与运维': /云服务|运维|服务器|\b(?:cloud|devops|hosting)\b/i,
  '🎨 设计与素材': /设计|素材|\b(?:design|assets)\b/i,
  '📈 金融理财': /金融|理财|投资|\b(?:finance|investing)\b/i,
  '📺 视频娱乐': /视频|影视|\b(?:video|movies)\b/i,
  '📰 资讯阅读': /资讯|新闻|阅读|\b(?:news|reading)\b/i,
  '🔥 极客社区': /极客|技术社区|\b(?:geek|community)\b/i,
  '🛒 购物电商': /购物|电商|\b(?:shopping|commerce)\b/i,
  '💬 社交沟通': /社交|沟通|\b(?:social|communication)\b/i,
  '🎵 音乐': /音乐|\bmusic\b/i,
  '📧 邮件': /邮件|邮箱|\b(?:mail|email)\b/i,
  '📄 文档协作': /文档|协作|\b(?:docs|documents|collaboration)\b/i,
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
