import { DEFAULT_JUSTDOIT_API_URL } from './settings.ts'
import { DesktopIdentityError, isDesktopEndpoint, isDesktopPublicKey, sameDesktopKey, verifyDesktopProof, type DesktopIdentity } from './desktop-identity.ts'
import { clearDesktopDiscovery, getDesktopDiscovery, invalidateDesktopDiscoveries, isDesktopDiscoveryActive, readDesktopLocal, registerDesktopDiscovery, type DesktopDiscoveryRequest } from './desktop-discovery.ts'
import { t } from './i18n.ts'

export const DESKTOP_ENDPOINT = DEFAULT_JUSTDOIT_API_URL
const CREDENTIAL_KEY = 'tb_desktop_connection'
const PENDING_REVOCATION_KEY = 'tb_desktop_pending_revocation'
const PAIRING_TIMEOUT_MS = 180_000
const TOKEN_PATTERN = /^[a-f0-9]{64}$/

export type DesktopConnectionState = 'not-running' | 'unpaired' | 'connected' | 'revoked'
export interface DesktopCredential extends DesktopIdentity { origin: string; token: string }
export interface DesktopPairing { origin: string; nonce: string; code: string; url: string }

let activePairing: AbortController | null = null
let credentialWrites: Promise<unknown> = Promise.resolve()
let credentialVersion = 0

function serializeCredentialWrite<T>(work: () => Promise<T>): Promise<T> {
  const locked = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('tb-desktop-credentials', work)
    return work()
  }
  const result = credentialWrites.then(locked, locked)
  credentialWrites = result.catch(() => undefined)
  return result
}

function checkCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException(t('desktop_pairCancelled'), 'AbortError')
}

export function getDesktopClientOrigin(): string {
  if (!/^[a-p]{32}$/.test(chrome.runtime.id)) throw new Error(t('desktop_extensionIdUnknown'))
  return `chrome-extension://${chrome.runtime.id}`
}

export function createDesktopPairing(): DesktopPairing {
  return createDesktopLink('pair')
}

export function createDesktopReconnect(): DesktopPairing {
  return createDesktopLink('connect')
}

function createDesktopLink(mode: 'pair' | 'connect'): DesktopPairing {
  const origin = getDesktopClientOrigin()
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  return { origin, nonce, code: nonce.slice(0, 6).toUpperCase(), url: `djs321-desktop://${mode}?${new URLSearchParams({ origin, nonce })}` }
}

export async function prepareDesktopConnection(link: DesktopPairing, mode: 'pair' | 'connect'): Promise<DesktopDiscoveryRequest> {
  const pinned = mode === 'connect' ? await getDesktopCredential() ?? await readCredential(PENDING_REVOCATION_KEY) : null
  if (mode === 'connect' && !pinned) throw new Error(t('desktop_appIdentityMissing'))
  const request: DesktopDiscoveryRequest = { origin: link.origin, nonce: link.nonce, mode, ...(pinned ? { publicKey: pinned.publicKey } : {}) }
  await registerDesktopDiscovery(request)
  return request
}

export async function getDesktopCredential(): Promise<DesktopCredential | null> {
  return readCredential(CREDENTIAL_KEY)
}

export async function hasPendingDesktopRevocation(): Promise<boolean> {
  return !!await readCredential(PENDING_REVOCATION_KEY)
}

async function readCredential(key: string): Promise<DesktopCredential | null> {
  const stored = (await readDesktopLocal(key))[key]
  if (!stored || typeof stored !== 'object') return null
  const value = stored as Partial<DesktopCredential>
  return value.origin === getDesktopClientOrigin() && typeof value.token === 'string' && TOKEN_PATTERN.test(value.token)
    && isDesktopEndpoint(value.endpoint) && isDesktopPublicKey(value.publicKey)
    ? { origin: value.origin, token: value.token, endpoint: value.endpoint, publicKey: value.publicKey } : null
}

function writeCredential(value: DesktopCredential | null, key = CREDENTIAL_KEY): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message || t('desktop_savePairingFailed')))
      else resolve()
    }
    if (value) chrome.storage.local.set({ [key]: value }, done)
    else chrome.storage.local.remove(key, done)
  })
}

export function desktopHeaders(credential?: DesktopCredential | null): Record<string, string> {
  return {
    'X-DJS321-Client': getDesktopClientOrigin(),
    ...(credential ? { Authorization: `Bearer ${credential.token}` } : {}),
  }
}

// Keep the timeout active through response decoding; redirects must never leak credentials.
export async function requestDesktop(path: string, init: RequestInit = {}, signal?: AbortSignal, timeoutMs = 5000, identity?: DesktopIdentity): Promise<{ response: Response; data: unknown }> {
  checkCancellation(signal)
  const target = identity ?? await getDesktopCredential()
  checkCancellation(signal)
  if (!target || !isDesktopEndpoint(target.endpoint) || !isDesktopPublicKey(target.publicKey)) throw new DesktopIdentityError()
  if (!/^\/(?:bridge\/(?:status|pair\?nonce=[a-f0-9]{64}|cancel|disconnect)|api\/inbox)$/.test(path)) throw new DesktopIdentityError()
  const controller = new AbortController()
  const abort = () => controller.abort()
  let rejectAbort: () => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new DOMException(t('desktop_requestAborted'), 'AbortError'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
  })
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, timeoutMs)
  try {
    const headers = new Headers(init.headers)
    headers.set('X-DJS321-Client', getDesktopClientOrigin())
    const request = async () => {
      const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
      const proofResponse = await fetch(`${target.endpoint}/bridge/identity?challenge=${challenge}`, {
        method: 'GET', headers: { 'X-DJS321-Client': getDesktopClientOrigin() }, signal: controller.signal,
        redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      })
      if (!proofResponse.ok) throw new DesktopIdentityError()
      let proof: unknown
      try { proof = await proofResponse.json() } catch { throw new DesktopIdentityError() }
      await verifyDesktopProof(proof, { client: getDesktopClientOrigin(), challenge, endpoint: target.endpoint, publicKey: target.publicKey })
      checkCancellation(controller.signal)
      const authorization = headers.get('Authorization')
      if (authorization) {
        const stored = await readCredential(path === '/bridge/disconnect' ? PENDING_REVOCATION_KEY : CREDENTIAL_KEY)
        if (!stored || authorization !== `Bearer ${stored.token}` || stored.endpoint !== target.endpoint || !sameDesktopKey(stored.publicKey, target.publicKey)) throw new DesktopIdentityError()
      }
      checkCancellation(controller.signal)
      const response = await fetch(`${target.endpoint}${path}`, {
        ...init, headers, signal: controller.signal,
        redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      })
      const data: unknown = response.ok && response.status !== 204 ? await response.json() : null
      return { response, data }
    }
    const result = await Promise.race([request(), aborted])
    checkCancellation(signal)
    return result
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectAbort)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('desktop_invalidProtocol'))
  return value as Record<string, unknown>
}

export async function probeDesktopConnection(signal?: AbortSignal): Promise<DesktopConnectionState> {
  const credential = await getDesktopCredential()
  checkCancellation(signal)
  if (!credential) return 'unpaired'
  let result: Awaited<ReturnType<typeof requestDesktop>>
  try {
    result = await requestDesktop('/bridge/status', { method: 'GET', headers: desktopHeaders(credential) }, signal, 5000, credential)
  } catch (error) {
    checkCancellation(signal)
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) return 'not-running'
    if (error instanceof DesktopIdentityError) throw error
    throw new Error(t('desktop_invalidProtocol'))
  }
  if (result.response.status === 401 || result.response.status === 403) return credential ? 'revoked' : 'unpaired'
  if (!result.response.ok) throw new Error(t('desktop_pairingUnsupported'))
  const data = record(result.data)
  if (data.app !== 'djs321' || data.protocol !== 2 || typeof data.paired !== 'boolean') throw new Error(t('desktop_incompatible'))
  return credential ? (data.paired ? 'connected' : 'revoked') : 'unpaired'
}

export async function loadDesktopConnectionSnapshot(signal?: AbortSignal): Promise<{
  state: DesktopConnectionState | 'error'; hasCredential: boolean; pendingRevocation: boolean; message: string
}> {
  const [credential, pendingRevocation, probe] = await Promise.all([
    getDesktopCredential(), hasPendingDesktopRevocation(),
    probeDesktopConnection(signal).then(state => ({ state, message: '' })).catch(error => {
      checkCancellation(signal)
      return { state: 'error' as const, message: error instanceof Error ? error.message : t('desktop_checkFailed') }
    }),
  ])
  checkCancellation(signal)
  return { ...probe, hasCredential: !!credential, pendingRevocation }
}

function waitForPoll(delay: number, signal: AbortSignal): Promise<void> {
  checkCancellation(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException(t('desktop_pairCancelled'), 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function waitForDesktopConnection(options: { discovery: DesktopPairing; signal?: AbortSignal; timeoutMs?: number; intervalMs?: number }): Promise<DesktopConnectionState> {
  checkCancellation(options.signal)
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  let expired = false
  const timeout = setTimeout(() => { expired = true; controller.abort() }, Math.min(20_000, Math.max(1, options.timeoutMs ?? 20_000)))
  try {
    const pinned = await getDesktopCredential() ?? await readCredential(PENDING_REVOCATION_KEY)
    if (!pinned) return 'unpaired'
    const discovery: DesktopDiscoveryRequest = { origin: options.discovery.origin, nonce: options.discovery.nonce, mode: 'connect', publicKey: pinned.publicKey }
    while (true) {
      checkCancellation(controller.signal)
      const announced = await getDesktopDiscovery(discovery)
      if (announced) {
        await serializeCredentialWrite(async () => {
          checkCancellation(controller.signal)
          if (!await isDesktopDiscoveryActive(discovery)) throw new DOMException(t('desktop_connectCancelled'), 'AbortError')
          const current = await getDesktopCredential() ?? await readCredential(PENDING_REVOCATION_KEY)
          if (!current || current.token !== pinned.token || !sameDesktopKey(current.publicKey, pinned.publicKey)) throw new DesktopIdentityError()
          const active = await getDesktopCredential()
          await writeCredential({ ...current, endpoint: announced.endpoint }, active ? CREDENTIAL_KEY : PENDING_REVOCATION_KEY)
          credentialVersion++
        })
        checkCancellation(controller.signal)
        return await probeDesktopConnection(controller.signal)
      }
      await waitForPoll(Math.max(1, options.intervalMs ?? 1000), controller.signal)
    }
  } catch (error) {
    checkCancellation(options.signal)
    if (expired) return 'not-running'
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
    await clearDesktopDiscovery(options.discovery)
  }
}

export async function pollDesktopPairing(pairing: DesktopPairing, options: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number } = {}): Promise<DesktopCredential> {
  if (pairing.origin !== getDesktopClientOrigin() || !TOKEN_PATTERN.test(pairing.nonce)) throw new Error(t('desktop_pairRequestInvalid'))
  checkCancellation(options.signal)
  activePairing?.abort()
  const controller = new AbortController()
  activePairing = controller
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  let expired = false
  let savedCredential: DesktopCredential | null = null
  let discovered: DesktopIdentity | null = null
  let savedVersion = 0
  const timeout = setTimeout(() => { expired = true; controller.abort() }, Math.min(PAIRING_TIMEOUT_MS, Math.max(1, options.timeoutMs ?? PAIRING_TIMEOUT_MS)))
  try {
    while (true) {
      checkCancellation(controller.signal)
      discovered ??= await getDesktopDiscovery({ origin: pairing.origin, nonce: pairing.nonce, mode: 'pair' })
      if (!discovered) { await waitForPoll(Math.max(1, options.intervalMs ?? 1000), controller.signal); continue }
      let result: Awaited<ReturnType<typeof requestDesktop>> | undefined
      try {
        result = await requestDesktop(`/bridge/pair?nonce=${pairing.nonce}`, { method: 'GET' }, controller.signal, 5000, discovered)
      } catch (error) {
        checkCancellation(controller.signal)
        if (error instanceof DesktopIdentityError) throw error
        if (!(error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError'))) throw new Error(t('desktop_pairResponseInvalid'))
      }
      if (result?.response.ok) {
        const data = record(result.data)
        if (data.state === 'denied') throw new Error(t('desktop_pairDenied'))
        if (data.state === 'approved') {
          if (typeof data.token !== 'string' || !TOKEN_PATTERN.test(data.token)) throw new Error(t('desktop_pairTokenInvalid'))
          const credential: DesktopCredential = { origin: pairing.origin, token: data.token, ...discovered }
          await serializeCredentialWrite(async () => {
            checkCancellation(controller.signal)
            if (!await isDesktopDiscoveryActive({ ...pairing, mode: 'pair' })) throw new DOMException(t('desktop_pairCancelled'), 'AbortError')
            await writeCredential(credential)
            savedCredential = credential
            savedVersion = ++credentialVersion
            await writeCredential(null, PENDING_REVOCATION_KEY)
            // A cancelled storage callback must not resurrect a disconnected/older pairing.
            if (controller.signal.aborted) {
              await writeCredential(null)
              credentialVersion++
              savedCredential = null
              checkCancellation(controller.signal)
            }
          })
          checkCancellation(controller.signal)
          return credential
        }
        if (data.state !== 'pending') throw new Error(t('desktop_pairStateInvalid'))
      } else if (result && result.response.status !== 404 && result.response.status < 500) {
        throw new Error(t('desktop_pairNotApproved'))
      }
      await waitForPoll(Math.max(1, options.intervalMs ?? 1000), controller.signal)
    }
  } catch (error) {
    if (savedCredential) {
      await serializeCredentialWrite(async () => {
        if (savedVersion === credentialVersion) { await writeCredential(null); credentialVersion++ }
      })
    }
    if (discovered) {
      // Failed approval/storage must revoke this nonce too; cleanup has its own deadline.
      await requestDesktop('/bridge/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce: pairing.nonce }),
      }, undefined, 1500, discovered).catch(() => undefined)
    }
    if (expired && !options.signal?.aborted) throw new Error(t('desktop_pairTimeout'))
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
    if (activePairing === controller) activePairing = null
    await clearDesktopDiscovery(pairing)
  }
}

export async function disconnectDesktop(signal?: AbortSignal): Promise<void> {
  activePairing?.abort()
  await serializeCredentialWrite(async () => {
    let credential: DesktopCredential | null = null
    try {
      await invalidateDesktopDiscoveries()
      credential = await getDesktopCredential() ?? await readCredential(PENDING_REVOCATION_KEY)
      if (credential) {
        await writeCredential(credential, PENDING_REVOCATION_KEY)
        await writeCredential(null)
        credentialVersion++
        const { response } = await requestDesktop('/bridge/disconnect', { method: 'POST', headers: desktopHeaders(credential) }, signal, 5000, credential)
        if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error(t('desktop_revokeIncomplete'))
      }
      await writeCredential(null, PENDING_REVOCATION_KEY)
    } catch {
      if (credential) await writeCredential(credential, PENDING_REVOCATION_KEY)
      throw new Error(t('desktop_revokePending'))
    } finally {
      await writeCredential(null)
      credentialVersion++
    }
  })
}

export function isLocalDesktopEndpoint(base: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)
}

export function createDesktopInboxRequest(items: readonly { title: string; url: string; note?: string; content?: string }[]): { requestId: string; body: string } {
  if (items.length < 1 || items.length > 100) throw new Error(t('desktop_batchSize'))
  for (const item of items) {
    for (const [field, limit] of [['title', 512], ['url', 8192], ['note', 16384], ['content', 200000]] as const) {
      const value = item[field]
      if ((value === undefined && (field === 'title' || field === 'url')) || (value !== undefined && (typeof value !== 'string' || value.length > limit))) {
        throw new Error(t('desktop_fieldTooLong', { field, limit }))
      }
    }
  }
  const requestId = crypto.randomUUID()
  const body = JSON.stringify({ requestId, items })
  if (new TextEncoder().encode(body).byteLength > 2 * 1024 * 1024) throw new Error(t('desktop_bodyTooLarge'))
  return { requestId, body }
}
