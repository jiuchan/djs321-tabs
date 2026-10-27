import { t } from './i18n.ts'

export function captureOrigins(urls: string[]): string[] {
  return [...new Set(urls.map(value => {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*') || url.username || url.password) {
      throw new Error(t('siteAccess_unsupportedPage'))
    }
    return `${url.protocol}//${url.host}/*`
  }))]
}

export async function requestCaptureAccess(urls: string[], deps = {
  request: (origins: string[]) => chrome.permissions.request({ origins }),
}): Promise<void> {
  const origins = captureOrigins(urls)
  // Call request before any await to retain the click's user activation.
  if (origins.length && !await deps.request(origins)) throw new Error(t('siteAccess_denied'))
}

export async function requireEndpointAccess(url: string): Promise<void> {
  if (!await chrome.permissions.contains({ origins: captureOrigins([url]) })) {
    throw new Error(t('siteAccess_endpointNotAuthorized'))
  }
}

export async function revokeOptionalSiteAccess(): Promise<void> {
  const { origins = [] } = await chrome.permissions.getAll()
  const optional = origins.filter(origin => origin !== 'http://localhost/*')
  if (optional.length && !await chrome.permissions.remove({ origins: optional })) throw new Error(t('siteAccess_revokePartial'))
}
