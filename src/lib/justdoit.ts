import { getJustDoItApiUrl } from './settings.ts'
import { withRetry, type RetryableError } from './retry.ts'
import { requireEndpointAccess } from './site-access.ts'
import { DESKTOP_ENDPOINT, createDesktopInboxRequest, desktopHeaders, getDesktopCredential, isLocalDesktopEndpoint, requestDesktop } from './desktop-connection.ts'
import { DesktopIdentityError } from './desktop-identity.ts'

export interface InboxPayload {
  title: string
  url: string
  note?: string
  source: string
  area?: string
  timestamp: string
  content?: string
}

export async function extractMarkdownFromTab(tabId: number, expectedUrl?: string): Promise<string | undefined> {
  const checkUrl = async () => {
    if (expectedUrl && (await chrome.tabs.get(tabId)).url !== expectedUrl) throw new Error('所选页面地址已变化，请重新选择后收集。')
  }
  await checkUrl()
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-extractor.js'] })
  const content = await new Promise<string | undefined>((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' }, (response) => {
      if (chrome.runtime.lastError || !response) reject(new Error('无法读取正文，请检查此网站的访问授权。'))
      else if (response.error) reject(new Error(response.error))
      else resolve(typeof response.content === 'string' ? response.content : undefined)
    })
  })
  await checkUrl()
  return content
}

export function inferAreaFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname
    if (/github\.com|gitlab\.com|stackoverflow\.com|npmjs\.com|developer\./.test(hostname)) return 'tech'
    if (/youtube\.com|bilibili\.com|netflix\.com|twitch\.tv/.test(hostname)) return 'leisure'
    if (/notion\.so|figma\.com|docs\.google/.test(hostname)) return 'work'
  } catch (e) {
    // ignore
  }
  return 'other'
}

export async function sendToJustDoIt(payload: Omit<InboxPayload, 'source' | 'timestamp'> | Omit<InboxPayload, 'source' | 'timestamp'>[]) {
  const isArray = Array.isArray(payload)
  const items = isArray ? payload : [payload]

  const fullPayloads: InboxPayload[] = items.map(p => ({
    ...p,
    area: p.area || inferAreaFromUrl(p.url),
    source: 'tab-butler',
    timestamp: new Date().toISOString()
  }))

  const base = await getJustDoItApiUrl()
  const local = isLocalDesktopEndpoint(base)
  if (local && base !== DESKTOP_ENDPOINT) throw new Error('请在插件设置恢复自动本机模式并配对，不能手动猜测本机端口。')
  const credential = local ? await getDesktopCredential() : null
  if (local && !credential) throw new Error('尚未配对桌面 App，请打开插件设置，点击连接并在 App 中批准配对。')
  await requireEndpointAccess(credential?.endpoint ?? base)
  const request = local ? createDesktopInboxRequest(fullPayloads) : null
  const body = request?.body ?? JSON.stringify(isArray ? fullPayloads : fullPayloads[0])
  const headers = { 'Content-Type': 'application/json', ...(local ? desktopHeaders(credential) : {}) }

  // 单次尝试：网络失败 / 5xx 标记可重试；4xx 与业务拒绝标记不可重试
  const attempt = async (): Promise<true> => {
    let res: Response
    let data: unknown
    try {
      const init: RequestInit = {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }
      if (local) {
        const result = await requestDesktop('/api/inbox', init, undefined, 15_000, credential!)
        res = result.response
        data = result.data
      } else {
        res = await fetch(`${base}/api/inbox`, init)
      }
    } catch (e) {
      const err: RetryableError = new Error(e instanceof DesktopIdentityError ? e.message : e instanceof SyntaxError ? '桌面端回执无效，请更新 App 后在插件设置重试。' : '网络请求失败，请确认桌面 App 正在运行；端口变化时请打开插件设置重新连接。')
      err.retryable = !(e instanceof SyntaxError || e instanceof DesktopIdentityError); err.cause = e
      throw err
    }
    if (!res.ok) {
      const err: RetryableError = new Error(local && (res.status === 401 || res.status === 403)
        ? '配对授权已撤销，请打开插件设置重新配对。'
        : `连接服务返回 ${res.status}，请打开插件设置检查地址或桌面 App 版本。`)
      err.retryable = res.status >= 500
      throw err
    }
    if (!local) data = await res.json()
    const receipt = data && typeof data === 'object' ? data as Record<string, unknown> : null
    if (local ? receipt?.success !== true || receipt.requestId !== request?.requestId || receipt.count !== fullPayloads.length : !receipt?.success) {
      const err: RetryableError = new Error(local ? '桌面端回执不匹配，未确认写入；请打开插件设置检查 App 版本。' : typeof receipt?.error === 'string' ? receipt.error : '服务未确认发送成功。')
      err.retryable = false
      throw err
    }
    return true
  }

  try {
    return await withRetry(attempt, { retries: 2, baseDelayMs: 500 })
  } catch (error) {
    throw error instanceof Error ? error : new Error('发送未完成，请打开插件设置检查连接。')
  }
}
