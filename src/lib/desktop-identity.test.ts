import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'

const origin = `chrome-extension://${'a'.repeat(32)}`
const endpoint = 'http://localhost:49152'
const challenge = 'b'.repeat(64)
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const jwk = keys.publicKey.export({ format: 'jwk' })
const publicKey = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! }

function proof(overrides: Record<string, unknown> = {}) {
  const value = { app: 'djs321', protocol: 2, client: origin, challenge, endpoint, publicKey, ...overrides }
  const bytes = JSON.stringify(['djs321-desktop', value.protocol, value.client, value.challenge, value.endpoint])
  return { ...value, signature: sign('sha256', Buffer.from(bytes), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') }
}

async function identity() {
  const module = await import('./desktop-identity.ts').catch(() => null)
  assert.ok(module, 'Dynamic identity verifier is not implemented')
  return module
}

test('verifies Node P-256 raw signatures with the exact cross-platform contract', async () => {
  const module = await identity()
  assert.deepEqual(await module.verifyDesktopProof(proof(), { client: origin, challenge, endpoint, publicKey }), proofFields())
})

function proofFields() { return { endpoint, publicKey } }

test('accepts only canonical localhost endpoints with an explicit actual port', async () => {
  const module = await identity()
  assert.equal(module.isDesktopEndpoint(endpoint), true)
  for (const value of ['http://127.0.0.1:49152', 'https://localhost:49152', 'http://localhost', 'http://localhost:80', 'http://localhost:0', `${endpoint}/`, `${endpoint}/bridge`, 'http://user@localhost:49152', `${endpoint}?x=1`, 'http://localhost.evil:49152']) {
    assert.equal(module.isDesktopEndpoint(value), false, value)
  }
})

test('rejects mismatched challenges, clients, endpoints, key pins and tampered signatures', async () => {
  const module = await identity()
  const expected = { client: origin, challenge, endpoint, publicKey }
  for (const value of [proof({ challenge: 'c'.repeat(64) }), proof({ client: `chrome-extension://${'b'.repeat(32)}` }), proof({ endpoint: 'http://localhost:49153' }), { ...proof(), signature: 'A'.repeat(86) }, proof({ publicKey: { ...publicKey, x: 'A'.repeat(43) } }), proof({ protocol: 1 }), proof({ app: 'other' }), proof({ publicKey: { ...publicKey, d: 'private' } })]) {
    await assert.rejects(module.verifyDesktopProof(value, expected), /身份|协议/)
  }
})

test('a first-pair public key still requires a valid signature and bounded exact fields', async () => {
  const module = await identity()
  assert.deepEqual(await module.verifyDesktopProof(proof(), { client: origin, challenge, endpoint }), proofFields())
  await assert.rejects(module.verifyDesktopProof({ ...proof(), arbitrary: true }, { client: origin, challenge, endpoint }), /身份|协议/)
  await assert.rejects(module.verifyDesktopProof({ ...proof(), signature: 'a'.repeat(10000) }, { client: origin, challenge, endpoint }), /身份|协议/)
})
