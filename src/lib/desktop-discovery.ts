import { isDesktopEndpoint, isDesktopPublicKey, sameDesktopKey, verifyDesktopProof, type DesktopIdentity, type DesktopPublicKey } from './desktop-identity.ts'
import { t } from './i18n.ts'

const REQUEST_PREFIX = 'tb_desktop_discovery:'
const RESULT_PREFIX = 'tb_desktop_discovery_result:'
const TTL_MS = 180_000
export const DESKTOP_GENERATION_KEY = 'tb_desktop_credential_generation'
export interface DesktopDiscoveryRequest { origin: string; nonce: string; mode: 'pair' | 'connect'; publicKey?: DesktopPublicKey }
interface StoredRequest extends DesktopDiscoveryRequest { expiresAt: number; generation: number }

function generationValue(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(t('desktop_localStateInvalid'))
  return value
}

// The caller holds the browser-wide credential lock; context-local counters are insufficient.
export async function invalidateDesktopDiscoveries(): Promise<void> {
  const generation = generationValue((await readDesktopLocal(DESKTOP_GENERATION_KEY))[DESKTOP_GENERATION_KEY])
  if (generation === Number.MAX_SAFE_INTEGER) throw new Error(t('desktop_localStateInvalid'))
  await writeDesktopLocal({ [DESKTOP_GENERATION_KEY]: generation + 1 })
}

export function readDesktopLocal(key: string | null): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, result => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message || t('desktop_readPairingFailed')))
      else resolve(result)
    })
  })
}

export function writeDesktopLocal(value: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message || t('desktop_savePairingFailed')))
      else resolve()
    })
  })
}

export function removeDesktopLocal(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message || t('desktop_clearPairingFailed')))
      else resolve()
    })
  })
}

function validRequest(value: unknown): value is StoredRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const request = value as Partial<StoredRequest>
  const now = Date.now()
  return request.origin === `chrome-extension://${chrome.runtime.id}` && /^[a-p]{32}$/.test(chrome.runtime.id)
    && typeof request.nonce === 'string' && /^[a-f0-9]{64}$/.test(request.nonce)
    && (request.mode === 'pair' || (request.mode === 'connect' && isDesktopPublicKey(request.publicKey)))
    && typeof request.expiresAt === 'number' && request.expiresAt > now && request.expiresAt <= now + TTL_MS
    && typeof request.generation === 'number' && Number.isSafeInteger(request.generation) && request.generation >= 0
}

export async function registerDesktopDiscovery(request: DesktopDiscoveryRequest): Promise<void> {
  const all = await readDesktopLocal(null)
  const generation = generationValue(all[DESKTOP_GENERATION_KEY])
  const stored = { ...request, expiresAt: Date.now() + TTL_MS, generation }
  if (!validRequest(stored)) throw new Error(t('desktop_discoveryInvalid'))
  const current = (value: unknown): value is StoredRequest => validRequest(value) && value.generation === generation
  const stale = Object.keys(all).filter(key => key.startsWith(REQUEST_PREFIX) && !current(all[key]))
  const orphan = Object.keys(all).filter(key => key.startsWith(RESULT_PREFIX) && !current(all[`${REQUEST_PREFIX}${key.slice(RESULT_PREFIX.length)}`]))
  if (stale.length || orphan.length) await removeDesktopLocal([...stale, ...stale.map(key => `${RESULT_PREFIX}${key.slice(REQUEST_PREFIX.length)}`), ...orphan])
  if (Object.keys(all).filter(key => key.startsWith(REQUEST_PREFIX) && current(all[key]) && key !== `${REQUEST_PREFIX}${request.nonce}`).length >= 8) {
    throw new Error(t('desktop_tooManyRequests'))
  }
  await writeDesktopLocal({ [`${REQUEST_PREFIX}${request.nonce}`]: stored })
}

export async function clearDesktopDiscovery(request: Pick<DesktopDiscoveryRequest, 'nonce'>): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(request.nonce)) return
  // Separate nonce keys let cancellation remove only its own attempt across MV3 contexts.
  await removeDesktopLocal([`${REQUEST_PREFIX}${request.nonce}`, `${RESULT_PREFIX}${request.nonce}`])
}

async function readRequest(nonce: string): Promise<StoredRequest | null> {
  const value = (await readDesktopLocal(`${REQUEST_PREFIX}${nonce}`))[`${REQUEST_PREFIX}${nonce}`]
  const generation = generationValue((await readDesktopLocal(DESKTOP_GENERATION_KEY))[DESKTOP_GENERATION_KEY])
  return validRequest(value) && value.nonce === nonce && value.generation === generation ? value : null
}

export async function isDesktopDiscoveryActive(request: DesktopDiscoveryRequest): Promise<boolean> {
  const stored = await readRequest(request.nonce)
  return !!stored && stored.origin === request.origin && stored.mode === request.mode
}

export async function getDesktopDiscovery(request: DesktopDiscoveryRequest): Promise<DesktopIdentity | null> {
  const stored = await readRequest(request.nonce)
  if (!stored || stored.origin !== request.origin || stored.mode !== request.mode) return null
  if (request.publicKey && (!stored.publicKey || !sameDesktopKey(request.publicKey, stored.publicKey))) return null
  const proof = (await readDesktopLocal(`${RESULT_PREFIX}${request.nonce}`))[`${RESULT_PREFIX}${request.nonce}`]
  if (!proof || typeof proof !== 'object') return null
  const endpoint = (proof as { endpoint?: unknown }).endpoint
  if (!isDesktopEndpoint(endpoint)) return null
  return verifyDesktopProof(proof, { client: stored.origin, challenge: request.nonce, endpoint, publicKey: stored.publicKey })
}

export async function acceptDesktopDiscovery(message: unknown, sender: chrome.runtime.MessageSender): Promise<boolean> {
  try {
    if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).sort().join(',') !== 'proof,type') return false
    const input = message as { type?: unknown; proof?: { challenge?: unknown } }
    if (input.type !== 'DESKTOP_DISCOVERY' || typeof input.proof?.challenge !== 'string' || !/^[a-f0-9]{64}$/.test(input.proof.challenge)) return false
    if (!sender.url || sender.id || (sender.frameId !== undefined && sender.frameId !== 0)) return false
    const url = new URL(sender.url)
    if (!isDesktopEndpoint(url.origin) || url.pathname !== '/bridge/connect' || url.search || url.username || url.password
      || (sender.origin !== undefined && sender.origin !== url.origin)) return false
    const request = await readRequest(input.proof.challenge)
    if (!request) return false
    await verifyDesktopProof(input.proof, { client: request.origin, challenge: request.nonce, endpoint: url.origin, publicKey: request.publicKey })
    const current = await readRequest(request.nonce)
    if (!current || JSON.stringify(current) !== JSON.stringify(request)) return false
    await writeDesktopLocal({ [`${RESULT_PREFIX}${request.nonce}`]: input.proof })
    if (!await readRequest(request.nonce)) { await clearDesktopDiscovery(request); return false }
    return true
  } catch { return false }
}
