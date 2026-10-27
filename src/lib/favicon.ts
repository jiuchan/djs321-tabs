import { t } from './i18n.ts'

// 站点图标一律取浏览器本地缓存的 _favicon（需 "favicon" 权限）：渲染时不访问网站本身，
// 也不经过任何第三方图标服务。浏览器没缓存过的站点会得到通用占位图标。
export function localFaviconUrl(pageUrl?: string | null, size = 32): string | undefined {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return undefined
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return undefined
    const url = new URL(chrome.runtime.getURL('/_favicon/'))
    url.searchParams.set('pageUrl', pageUrl)
    url.searchParams.set('size', String(size))
    return url.toString()
  } catch {
    return undefined
  }
}

export function getQuickLinkFallbackLabel(title?: string, url?: string) {
  const text = title?.trim() || url?.trim() || t('tabs_faviconFallback')
  const letterOrDigit = Array.from(text).find(char => /[\p{L}\p{N}]/u.test(char))
  return (letterOrDigit || t('tabs_faviconFallback')).toUpperCase()
}
