import { generateKeyPairSync, sign } from 'node:crypto'
import type { TestContext } from 'node:test'

export const origin = `chrome-extension://${'a'.repeat(32)}`
export const endpoint = 'http://localhost:49152'
export const token = 'b'.repeat(64)
export const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = keys.publicKey.export({ format: 'jwk' })
export const publicKey = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! }
export const credential = { origin, token, endpoint, publicKey }
export const credentialKey = 'tb_desktop_connection'
export const pendingKey = 'tb_desktop_pending_revocation'
export function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }) }

export function signedProof(challenge: string, overrides: Record<string, unknown> = {}, signer = keys) {
  const exported = signer.publicKey.export({ format: 'jwk' })
  const value = { app: 'djs321', protocol: 2, client: origin, challenge, endpoint,
    publicKey: { kty: 'EC', crv: 'P-256', x: exported.x!, y: exported.y! }, ...overrides }
  const bytes = JSON.stringify(['djs321-desktop', value.protocol, value.client, value.challenge, value.endpoint])
  return { ...value, signature: sign('sha256', Buffer.from(bytes), { key: signer.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') }
}

export function fixture(t: TestContext, stored?: unknown, pending?: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
  const previousFetch = globalThis.fetch
  const local: Record<string, unknown> = {}
  if (stored) local[credentialKey] = stored
  if (pending) local[pendingKey] = pending
  const calls: { url: string; init?: RequestInit }[] = []
  let beforeWrite = (_value: Record<string, unknown>, done: () => void) => done()
  let respond = async (_url: string, _init?: RequestInit): Promise<Response> => json({ app: 'djs321', protocol: 2, paired: true })
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    runtime: { id: 'a'.repeat(32) },
    storage: {
      local: {
        get: (_key: unknown, callback: (value: unknown) => void) => callback(structuredClone(local)),
        set: (value: Record<string, unknown>, callback: () => void) => beforeWrite(value, () => { Object.assign(local, structuredClone(value)); callback() }),
        remove: (name: string | string[], callback: () => void) => { for (const key of Array.isArray(name) ? name : [name]) delete local[key]; callback() },
      },
      sync: { set: () => { throw new Error('Pairing secrets must never enter sync') } },
    },
  } })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.includes('/bridge/identity?')) return json(signedProof(new URL(url).searchParams.get('challenge')!, { endpoint: new URL(url).origin }))
    return respond(url, init)
  }
  t.after(() => {
    globalThis.fetch = previousFetch
    if (previous) Object.defineProperty(globalThis, 'chrome', previous)
    else Reflect.deleteProperty(globalThis, 'chrome')
  })
  return { local, calls, respond: (next: typeof respond) => { respond = next }, beforeWrite: (next: typeof beforeWrite) => { beforeWrite = next } }
}
