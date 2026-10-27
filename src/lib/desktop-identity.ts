import { t } from './i18n.ts'

export interface DesktopPublicKey { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export interface DesktopIdentity { endpoint: string; publicKey: DesktopPublicKey }
export interface DesktopProof extends DesktopIdentity {
  app: 'djs321'; protocol: 2; client: string; challenge: string; signature: string
}

export class DesktopIdentityError extends Error {
  constructor() { super(t('desktop_identityMismatch')); this.name = 'DesktopIdentityError' }
}

export function isDesktopEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && url.hostname === 'localhost' && !!url.port && Number(url.port) > 0
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && url.origin === value
  } catch { return false }
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  if (encoded !== value) throw new DesktopIdentityError()
  return bytes
}

export function isDesktopPublicKey(value: unknown): value is DesktopPublicKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const key = value as Record<string, unknown>
  if (Object.keys(key).sort().join(',') !== 'crv,kty,x,y' || key.kty !== 'EC' || key.crv !== 'P-256') return false
  try {
    return [key.x, key.y].every(part => typeof part === 'string' && /^[A-Za-z0-9_-]{43}$/.test(part) && decode(part).byteLength === 32)
  } catch { return false }
}

export function sameDesktopKey(first: DesktopPublicKey, second: DesktopPublicKey): boolean {
  return first.kty === second.kty && first.crv === second.crv && first.x === second.x && first.y === second.y
}

export async function verifyDesktopProof(value: unknown, expected: { client: string; challenge: string; endpoint: string; publicKey?: DesktopPublicKey }): Promise<DesktopIdentity> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopIdentityError()
  const proof = value as Record<string, unknown>
  if (Object.keys(proof).sort().join(',') !== 'app,challenge,client,endpoint,protocol,publicKey,signature'
    || proof.app !== 'djs321' || proof.protocol !== 2 || proof.client !== expected.client || proof.challenge !== expected.challenge
    || !/^chrome-extension:\/\/[a-p]{32}$/.test(expected.client) || !/^[a-f0-9]{64}$/.test(expected.challenge)
    || proof.endpoint !== expected.endpoint || !isDesktopEndpoint(proof.endpoint) || !isDesktopPublicKey(proof.publicKey)
    || (expected.publicKey && !sameDesktopKey(proof.publicKey, expected.publicKey))
    || typeof proof.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(proof.signature)) throw new DesktopIdentityError()
  try {
    const signature = decode(proof.signature)
    if (signature.byteLength !== 64) throw new DesktopIdentityError()
    const key = await crypto.subtle.importKey('jwk', proof.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const bytes = new TextEncoder().encode(JSON.stringify(['djs321-desktop', 2, proof.client, proof.challenge, proof.endpoint]))
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, bytes)) throw new DesktopIdentityError()
    return { endpoint: proof.endpoint, publicKey: { ...proof.publicKey } }
  } catch { throw new DesktopIdentityError() }
}
