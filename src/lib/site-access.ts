export function captureOrigins(urls: string[]): string[] {
  return [...new Set(urls.map(value => {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.includes('*') || url.username || url.password) {
      throw new Error('此页面不支持正文提取，请使用普通 HTTP/HTTPS 网页。')
    }
    return `${url.protocol}//${url.host}/*`
  }))]
}

export async function requestCaptureAccess(urls: string[], deps = {
  request: (origins: string[]) => chrome.permissions.request({ origins }),
}): Promise<void> {
  const origins = captureOrigins(urls)
  // Call request before any await to retain the click's user activation.
  if (origins.length && !await deps.request(origins)) throw new Error('未授权访问这些网站，未提取正文或发送任务。')
}

export async function requireEndpointAccess(url: string): Promise<void> {
  if (!await chrome.permissions.contains({ origins: captureOrigins([url]) })) {
    throw new Error('请先在插件设置中保存并授权此连接地址。')
  }
}

export async function revokeOptionalSiteAccess(): Promise<void> {
  const { origins = [] } = await chrome.permissions.getAll()
  const optional = origins.filter(origin => origin !== 'http://localhost/*')
  if (optional.length && !await chrome.permissions.remove({ origins: optional })) throw new Error('部分授权未撤销。')
}
