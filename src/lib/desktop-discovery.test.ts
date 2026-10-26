import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { fixture, origin, endpoint, publicKey, signedProof } from './desktop-fixture.test.ts'

const nonce = 'c'.repeat(64)
const request = { origin, nonce, mode: 'pair' as const }
const sender = { url: `${endpoint}/bridge/connect#origin=${encodeURIComponent(origin)}&nonce=${nonce}`, origin: endpoint, frameId: 0 }
async function discovery() {
  const module = await import('./desktop-discovery.ts').catch(() => null)
  assert.ok(module, 'Persisted dynamic discovery is not implemented')
  return module
}

test('registers nonce locally before accepting the public signed callback and returns no credential', async t => {
  const fx = fixture(t)
  const module = await discovery()
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), false)
  await module.registerDesktopDiscovery(request)
  assert.ok(Object.keys(fx.local).some(key => key.includes(nonce)))
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), true)
  assert.deepEqual(await module.getDesktopDiscovery(request), { endpoint, publicKey })
  assert.equal(JSON.stringify(fx.local).includes('token'), false)
  assert.equal(fx.calls.length, 0)
  await module.clearDesktopDiscovery(request)
  assert.deepEqual(fx.local, {})
})

test('rejects any sender outside the exact localhost callback page', async t => {
  fixture(t)
  const module = await discovery()
  await module.registerDesktopDiscovery(request)
  const message = { type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }
  for (const url of [`${endpoint}/other`, `${endpoint}/bridge/connect/`, `${endpoint}/bridge/connect?foo=1`, 'http://127.0.0.1:49152/bridge/connect', 'https://localhost:49152/bridge/connect', 'https://evil.example/bridge/connect', 'http://user@localhost:49152/bridge/connect']) {
    assert.equal(await module.acceptDesktopDiscovery(message, { url, frameId: 0 }), false, url)
  }
  assert.equal(await module.acceptDesktopDiscovery(message, { ...sender, origin: 'https://evil.example' }), false)
  assert.equal(await module.acceptDesktopDiscovery(message, { ...sender, frameId: 1 }), false)
  assert.equal(await module.acceptDesktopDiscovery(message, {}), false)
})

test('reconnect validates a pinned key and permits only the announced actual port', async t => {
  fixture(t)
  const module = await discovery()
  const reconnect = { ...request, mode: 'connect' as const, publicKey }
  await module.registerDesktopDiscovery(reconnect)
  const changed = 'http://localhost:49153'
  const message = { type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce, { endpoint: changed }) }
  assert.equal(await module.acceptDesktopDiscovery(message, sender), false)
  assert.equal(await module.acceptDesktopDiscovery(message, { ...sender, url: `${changed}/bridge/connect`, origin: changed }), true)
  assert.deepEqual(await module.getDesktopDiscovery(reconnect), { endpoint: changed, publicKey })
  await module.clearDesktopDiscovery(reconnect)
  await module.registerDesktopDiscovery(reconnect)
  const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce, {}, impostor) }, sender), false)
  await assert.rejects(module.registerDesktopDiscovery({ ...request, mode: 'connect' }), /身份|配对/)
})

test('expiry, cancellation, unknown nonces, client mismatch and arbitrary commands fail closed', async t => {
  const fx = fixture(t)
  const module = await discovery()
  await module.registerDesktopDiscovery(request)
  assert.equal(await module.acceptDesktopDiscovery({ type: 'SEND', proof: signedProof(nonce) }, sender), false)
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof('d'.repeat(64)) }, sender), false)
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce, { client: `chrome-extension://${'b'.repeat(32)}` }) }, sender), false)
  for (const value of Object.values(fx.local)) if (value && typeof value === 'object') (value as { expiresAt: number }).expiresAt = Date.now() - 1
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), false)
  await module.registerDesktopDiscovery(request)
  await module.clearDesktopDiscovery(request)
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), false)
})

test('cancellation while proof is saved never makes the removed discovery readable', async t => {
  const fx = fixture(t)
  const module = await discovery()
  await module.registerDesktopDiscovery(request)
  fx.beforeWrite((_value, done) => { void module.clearDesktopDiscovery(request).then(done) })
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), false)
  assert.equal(await module.getDesktopDiscovery(request), null)
})

test('shared disconnect generation invalidates old callbacks and permits only a fresh request', async t => {
  fixture(t)
  const module = await discovery()
  await module.registerDesktopDiscovery(request)
  await module.invalidateDesktopDiscoveries()
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), false)
  assert.equal(await module.getDesktopDiscovery(request), null)
  await module.registerDesktopDiscovery(request)
  assert.equal(await module.acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(nonce) }, sender), true)
})

test('invalid or exhausted shared generations fail closed without resetting cancellation history', async t => {
  const fx = fixture(t)
  const module = await discovery()
  fx.local[module.DESKTOP_GENERATION_KEY] = 'invalid'
  await assert.rejects(module.registerDesktopDiscovery(request), /状态无效/)
  assert.equal(fx.local[module.DESKTOP_GENERATION_KEY], 'invalid')
  fx.local[module.DESKTOP_GENERATION_KEY] = Number.MAX_SAFE_INTEGER
  await assert.rejects(module.invalidateDesktopDiscoveries(), /状态无效/)
  assert.equal(fx.local[module.DESKTOP_GENERATION_KEY], Number.MAX_SAFE_INTEGER)
})

test('manifest and background expose only localhost handshake messages, with callback-only acceptance', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.host_permissions, ['http://localhost/*'])
  assert.deepEqual(manifest.externally_connectable, { matches: ['http://localhost/bridge/connect'] })
  assert.equal(manifest.permissions.includes('nativeMessaging'), false)
  assert.equal(manifest.content_scripts, undefined)
  const background = readFileSync(new URL('../background/index.ts', import.meta.url), 'utf8')
  assert.match(background, /onMessageExternal\.addListener/)
  assert.match(background, /acceptDesktopDiscovery/)
  assert.match(background, /sendResponse\(\{ ok/)
  assert.match(background, /return true/)
})
