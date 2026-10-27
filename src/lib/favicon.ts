import { t } from './i18n.ts'

const NOISY_FAVICON_HOSTS = new Set([
  'www.google.com',
  'google.com',
  't0.gstatic.com',
  't1.gstatic.com',
  't2.gstatic.com',
  't3.gstatic.com',
])

export function isNoisyFaviconServiceUrl(iconUrl?: string | null) {
  if (!iconUrl) return false

  try {
    const parsed = new URL(iconUrl)
    if (!NOISY_FAVICON_HOSTS.has(parsed.hostname.toLowerCase())) return false
    return parsed.pathname.includes('/s2/favicons') || parsed.pathname.includes('/faviconV2')
  } catch {
    return false
  }
}

export function getRenderableFaviconUrl(iconUrl?: string | null) {
  if (!iconUrl || isNoisyFaviconServiceUrl(iconUrl)) return undefined
  return iconUrl
}

export function pickPersistableFaviconUrl(iconUrl?: string | null) {
  return getRenderableFaviconUrl(iconUrl)
}

export function getQuickLinkFallbackLabel(title?: string, url?: string) {
  const text = title?.trim() || url?.trim() || t('tabs_faviconFallback')
  const letterOrDigit = Array.from(text).find(char => /[\p{L}\p{N}]/u.test(char))
  return (letterOrDigit || t('tabs_faviconFallback')).toUpperCase()
}
