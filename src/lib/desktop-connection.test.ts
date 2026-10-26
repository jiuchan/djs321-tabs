import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import * as client from './desktop-connection.ts'
import { acceptDesktopDiscovery, DESKTOP_GENERATION_KEY, registerDesktopDiscovery } from './desktop-discovery.ts'
import { fixture, origin, endpoint, token, publicKey, credential, credentialKey, pendingKey, signedProof, json } from './desktop-fixture.test.ts'

async function announce(pair: client.DesktopPairing, mode: 'pair' | 'connect' = 'pair', actual = endpoint) {
  await registerDesktopDiscovery({ ...pair, mode, ...(mode === 'connect' ? { publicKey } : {}) })
  assert.equal(await acceptDesktopDiscovery({ type: 'DESKTOP_DISCOVERY', proof: signedProof(pair.nonce, { endpoint: actual }) }, { url: `${actual}/bridge/connect`, origin: actual, frameId: 0 }), true)
}
const authenticated = (fx: ReturnType<typeof fixture>) => fx.calls.filter(call => new Headers(call.init?.headers).has('Authorization'))

test('another settings page disconnect invalidates a late native approval across browser contexts', async t => {
  const fx = fixture(t)
  const second = await import(`./desktop-connection.ts?context=${crypto.randomUUID()}`) as typeof client
  const previous = Object.getOwnPropertyDescriptor(navigator, 'locks')
  let queue: Promise<unknown> = Promise.resolve()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, work: () => Promise<unknown>) => {
    const result = queue.then(work); queue = result.catch(() => undefined); return result
  } } })
  t.after(() => { if (previous) Object.defineProperty(navigator, 'locks', previous); else Reflect.deleteProperty(navigator, 'locks') })
  const pair = client.createDesktopPairing()
  await announce(pair)
  let release: (() => void) | undefined
  fx.respond(async url => {
    if (url.includes('/bridge/pair?')) { await new Promise<void>(resolve => { release = resolve }); return json({ state: 'approved', token }) }
    return json({ success: true })
  })
  const pending = client.pollDesktopPairing(pair)
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  while (!release) await new Promise(resolve => setTimeout(resolve, 1))
  await second.disconnectDesktop()
  release()
  await rejected
  assert.equal(await client.getDesktopCredential(), null)
  assert.equal(fx.calls.at(-1)?.url, `${endpoint}/bridge/cancel`)
});

test('failed identity probe retains credential and inactive-revocation recovery flags', async t => {
  fixture(t, credential, credential)
  globalThis.fetch = async () => json({ app: 'other' })
  assert.equal(typeof client.loadDesktopConnectionSnapshot, 'function')
  const snapshot = await client.loadDesktopConnectionSnapshot()
  assert.equal(snapshot.state, 'error')
  assert.equal(snapshot.hasCredential, true)
  assert.equal(snapshot.pendingRevocation, true)
  assert.match(snapshot.message, /身份/)
});

test('pair and reconnect links contain only runtime origin and independent fresh nonces', t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  assert.equal(typeof client.createDesktopReconnect, 'function')
  const connect = client.createDesktopReconnect()
  for (const [link, mode] of [[pair, 'pair'], [connect, 'connect']] as const) {
    const url = new URL(link.url)
    assert.equal(url.protocol, 'djs321-desktop:')
    assert.equal(url.hostname, mode)
    assert.deepEqual([...url.searchParams.keys()], ['origin', 'nonce'])
    assert.equal(url.searchParams.get('origin'), origin)
    assert.equal(url.searchParams.get('nonce'), link.nonce)
    assert.match(link.nonce, /^[a-f0-9]{64}$/)
  }
  assert.equal(pair.code, pair.nonce.slice(0, 6).toUpperCase())
  assert.notEqual(pair.nonce, connect.nonce)
  assert.deepEqual(fx.local, {})
  assert.equal(fx.calls.length, 0)
})

test('authenticated status verifies fresh identity before using the saved actual endpoint', async t => {
  const fx = fixture(t, credential)
  assert.equal(await client.probeDesktopConnection(), 'connected')
  assert.equal(fx.calls.length, 2)
  assert.equal(new URL(fx.calls[0].url).pathname, '/bridge/identity')
  assert.match(new URL(fx.calls[0].url).searchParams.get('challenge')!, /^[a-f0-9]{64}$/)
  assert.equal(new Headers(fx.calls[0].init?.headers).has('Authorization'), false)
  assert.equal(fx.calls[1].url, `${endpoint}/bridge/status`)
  assert.equal(new Headers(fx.calls[1].init?.headers).get('Authorization'), `Bearer ${token}`)
  for (const call of fx.calls) {
    assert.equal(new URL(call.url).origin, endpoint)
    assert.equal(new Headers(call.init?.headers).get('X-DJS321-Client'), origin)
    assert.equal(new Headers(call.init?.headers).has('Origin'), false)
    assert.equal(call.init?.redirect, 'error')
    assert.equal(call.init?.credentials, 'omit')
  }
})

test('old unpinned and malformed credentials require re-pairing without fixed-port probes', async t => {
  const fx = fixture(t, { origin, token })
  assert.equal(await client.getDesktopCredential(), null)
  assert.equal(await client.probeDesktopConnection(), 'unpaired')
  for (const value of [{ ...credential, token: 'B'.repeat(64) }, { ...credential, endpoint: 'http://127.0.0.1:49152' }, { ...credential, origin: 'other' }, { ...credential, publicKey: {} }]) {
    fx.local[credentialKey] = value
    assert.equal(await client.getDesktopCredential(), null)
  }
  fx.local[credentialKey] = credential
  assert.deepEqual(await client.getDesktopCredential(), credential)
  assert.equal(fx.calls.length, 0)
})

test('another service at a stale port receives neither token nor task on identity mismatch', async t => {
  const fx = fixture(t, credential)
  const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  globalThis.fetch = async (input, init) => {
    fx.calls.push({ url: String(input), init })
    return json(signedProof(new URL(String(input)).searchParams.get('challenge')!, {}, impostor))
  }
  await assert.rejects(client.probeDesktopConnection(), /身份/)
  assert.equal(fx.calls.length, 1)
  assert.equal(authenticated(fx).length, 0)
  assert.equal(fx.calls[0].init?.body, undefined)
})

test('stopped App and revoked credentials remain distinct after verified status', async t => {
  const fx = fixture(t, credential)
  fx.respond(async () => { throw new TypeError('connection refused') })
  assert.equal(await client.probeDesktopConnection(), 'not-running')
  fx.respond(async () => json({}, 401))
  assert.equal(await client.probeDesktopConnection(), 'revoked')
  fx.respond(async () => json({ app: 'djs321', protocol: 2, paired: false }))
  assert.equal(await client.probeDesktopConnection(), 'revoked')
})
for (const value of [{ app: 'other', protocol: 2, paired: true }, { app: 'djs321', protocol: 1, paired: true }, { app: 'djs321', protocol: 2, paired: 'yes' }]) {
  test(`status rejects ${JSON.stringify(value)}`, async t => {
    const fx = fixture(t, credential)
    fx.respond(async () => json(value))
    await assert.rejects(client.probeDesktopConnection(), /版本|协议/)
  })
}

test('pair waits for nonce announcement without probing or scanning any port', async t => {
  const fx = fixture(t)
  await assert.rejects(client.pollDesktopPairing(client.createDesktopPairing(), { timeoutMs: 15, intervalMs: 1 }), /超时/)
  assert.equal(fx.calls.length, 0)
  assert.deepEqual(fx.local, {})
})
test('native approval pins actual endpoint and public identity locally without sending content', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  let count = 0
  fx.respond(async () => json(++count === 1 ? { state: 'pending' } : { state: 'approved', token }))
  assert.deepEqual(await client.pollDesktopPairing(pair, { intervalMs: 1 }), credential)
  assert.deepEqual(fx.local, { [credentialKey]: credential })
  assert.equal(fx.calls.filter(call => call.url.includes('/bridge/pair?')).length, 2)
  assert.ok(fx.calls.every(call => call.init?.body === undefined))
  assert.equal(authenticated(fx).length, 0)
})
for (const value of [{ state: 'denied' }, { state: 'approved' }, { state: 'approved', token: 'B'.repeat(64) }, { state: 'unknown' }]) {
  test(`pairing rejects ${JSON.stringify(value)}`, async t => {
    const fx = fixture(t)
    const pair = client.createDesktopPairing()
    await announce(pair)
    fx.respond(async () => json(value))
    await assert.rejects(client.pollDesktopPairing(pair, { intervalMs: 1 }))
    assert.deepEqual(fx.local, {})
  })
}
test('cancel aborts in-flight approval and independently verifies nonce-only cleanup', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  const controller = new AbortController()
  fx.respond(async (url, init) => {
    if (url.endsWith('/bridge/cancel')) { assert.equal(init?.signal?.aborted, false); return json({ success: true }) }
    controller.abort()
    return json({ state: 'approved', token })
  })
  await assert.rejects(client.pollDesktopPairing(pair, { signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(fx.local, {})
  assert.equal(fx.calls.at(-1)?.url, `${endpoint}/bridge/cancel`)
  assert.deepEqual(JSON.parse(String(fx.calls.at(-1)?.init?.body)), { nonce: pair.nonce })
  assert.ok(fx.calls.at(-2)?.url.includes('/bridge/identity?'))
  assert.equal(authenticated(fx).length, 0)
})
test('cancelled sleep cannot begin another poll; expiry cancels only its own nonce', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  const controller = new AbortController()
  fx.respond(async url => { if (url.includes('/bridge/pair?')) setTimeout(() => controller.abort(), 1); return json({ state: 'pending' }) })
  await assert.rejects(client.pollDesktopPairing(pair, { signal: controller.signal, intervalMs: 1000 }), { name: 'AbortError' })
  assert.equal(fx.calls.filter(call => call.url.includes('/bridge/pair?')).length, 1)
  const next = client.createDesktopPairing()
  await announce(next)
  fx.respond(async () => json({ state: 'pending' }))
  await assert.rejects(client.pollDesktopPairing(next, { timeoutMs: 15, intervalMs: 1 }), /超时/)
  assert.deepEqual(JSON.parse(String(fx.calls.at(-1)?.init?.body)), { nonce: next.nonce })
  assert.deepEqual(fx.local, {})
})
for (const moment of ['during', 'after'] as const) {
  test(`cancel ${moment} storage completion clears the late token`, async t => {
    const fx = fixture(t)
    const pair = client.createDesktopPairing()
    await announce(pair)
    const controller = new AbortController()
    fx.respond(async () => json({ state: 'approved', token }))
    fx.beforeWrite((value, done) => {
      if (!value[credentialKey]) { done(); return }
      if (moment === 'during') { controller.abort(); setTimeout(done, 1) }
      else setTimeout(() => { done(); queueMicrotask(() => controller.abort()) }, 1)
    })
    await assert.rejects(client.pollDesktopPairing(pair, { signal: controller.signal }), { name: 'AbortError' })
    assert.deepEqual(fx.local, {})
  })
}
test('new pairing cancels older late approval without overwriting the new credential', async t => {
  const fx = fixture(t)
  const older = client.createDesktopPairing()
  const newer = client.createDesktopPairing()
  await announce(older)
  await announce(newer)
  let release: (() => void) | undefined
  fx.respond(async url => {
    if (url.endsWith(older.nonce)) { await new Promise<void>(resolve => { release = resolve }); return json({ state: 'approved', token }) }
    return json(url.endsWith('/bridge/cancel') ? { success: true } : { state: 'approved', token: 'c'.repeat(64) })
  })
  const rejected = assert.rejects(client.pollDesktopPairing(older), { name: 'AbortError' })
  while (!release) await new Promise(resolve => setTimeout(resolve, 1))
  await client.pollDesktopPairing(newer)
  release()
  await rejected
  assert.deepEqual(fx.local, { [credentialKey]: { ...credential, token: 'c'.repeat(64) } })
})
test('offline disconnect deactivates before probing and keeps only inactive revocation', async t => {
  const fx = fixture(t, credential)
  globalThis.fetch = async (input, init) => {
    fx.calls.push({ url: String(input), init })
    assert.equal(await client.getDesktopCredential(), null)
    throw new TypeError('App stopped')
  }
  await assert.rejects(client.disconnectDesktop(), /本机已停止发送.*打开 App.*再次点击断开/)
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 1, [pendingKey]: credential })
  assert.equal(authenticated(fx).length, 0)
  assert.equal(await client.probeDesktopConnection(), 'unpaired')
})
test('pending revocation retry verifies identity and accepts 204 or invalid authorization', async t => {
  const fx = fixture(t, undefined, credential)
  fx.respond(async () => new Response(null, { status: 204 }))
  await client.disconnectDesktop()
  assert.equal(authenticated(fx)[0].url, `${endpoint}/bridge/disconnect`)
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 1 })
  fx.local[pendingKey] = credential
  fx.respond(async () => json({}, 401))
  await client.disconnectDesktop()
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 2 })
})
test('identity mismatch during revoke preserves inactive state without sending a bearer', async t => {
  const fx = fixture(t, credential)
  globalThis.fetch = async (input, init) => { fx.calls.push({ url: String(input), init }); return json({ success: true }) }
  await assert.rejects(client.disconnectDesktop(), /再次点击断开/)
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 1, [pendingKey]: credential })
  assert.equal(authenticated(fx).length, 0)
})
test('new native approval clears obsolete inactive revocation', async t => {
  const fx = fixture(t, undefined, credential)
  const pair = client.createDesktopPairing()
  await announce(pair)
  fx.respond(async () => json({ state: 'approved', token }))
  await client.pollDesktopPairing(pair)
  assert.deepEqual(fx.local, { [credentialKey]: credential })
})
test('reconnect learns actual new port without probing old port or re-pairing', async t => {
  const fx = fixture(t, credential)
  const connect = client.createDesktopReconnect()
  const changed = 'http://localhost:49153'
  await announce(connect, 'connect', changed)
  assert.equal(await client.waitForDesktopConnection({ discovery: connect, intervalMs: 1 }), 'connected')
  assert.deepEqual(fx.local, { [credentialKey]: { ...credential, endpoint: changed } })
  assert.ok(fx.calls.every(call => call.url.startsWith(changed) && !call.url.includes('/bridge/pair')))
})
test('revocation-only reconnect updates its inactive port without enabling sends', async t => {
  const fx = fixture(t, undefined, credential)
  const connect = client.createDesktopReconnect()
  const changed = 'http://localhost:49154'
  await announce(connect, 'connect', changed)
  assert.equal(await client.waitForDesktopConnection({ discovery: connect, intervalMs: 1 }), 'unpaired')
  assert.deepEqual(fx.local, { [pendingKey]: { ...credential, endpoint: changed } })
  assert.equal(await client.getDesktopCredential(), null)
  assert.equal(authenticated(fx).length, 0)
})
test('bounded reconnect with no callback never scans or destroys the existing credential', async t => {
  const fx = fixture(t, credential)
  assert.equal(await client.waitForDesktopConnection({ discovery: client.createDesktopReconnect(), timeoutMs: 15, intervalMs: 1 }), 'not-running')
  assert.deepEqual(fx.local, { [credentialKey]: credential })
  assert.equal(fx.calls.length, 0)
})
test('request deadline includes identity decoding and cannot send late authenticated data', async t => {
  const fx = fixture(t, credential)
  globalThis.fetch = async (input, init) => { fx.calls.push({ url: String(input), init }); return new Promise<Response>(() => {}) }
  const result = await Promise.race([
    client.requestDesktop('/bridge/status', { headers: client.desktopHeaders(credential) }, undefined, 10, credential).then(() => 'success', error => error.name),
    new Promise(resolve => setTimeout(() => resolve('not bounded'), 40)),
  ])
  assert.equal(result, 'AbortError')
  assert.equal(fx.calls[0].init?.signal?.aborted, true)
  assert.equal(authenticated(fx).length, 0)
})
test('storage read failures cannot report a successful connection', async t => {
  fixture(t, credential)
  chrome.storage.local.get = (_key: unknown, done: (value: unknown) => void) => {
    Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: 'storage unavailable' } })
    done({})
    Reflect.deleteProperty(chrome.runtime, 'lastError')
  }
  await assert.rejects(client.probeDesktopConnection(), /storage unavailable/)
})

test('failed credential storage cancels an approved native nonce and never enables sends', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  fx.respond(async url => json(url.endsWith('/bridge/cancel') ? { success: true } : { state: 'approved', token }))
  chrome.storage.local.set = (_value: unknown, done: () => void) => {
    Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: 'storage full' } })
    done()
    Reflect.deleteProperty(chrome.runtime, 'lastError')
  }
  await assert.rejects(client.pollDesktopPairing(pair), /storage full/)
  assert.equal(await client.getDesktopCredential(), null)
  assert.equal(fx.calls.at(-1)?.url, `${endpoint}/bridge/cancel`)
  assert.deepEqual(fx.local, {})
})

test('a failure after token storage rolls back the active credential, not just the UI', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  fx.respond(async url => json(url.endsWith('/bridge/cancel') ? { success: true } : { state: 'approved', token }))
  const remove = chrome.storage.local.remove
  chrome.storage.local.remove = (name: string | string[], done: () => void) => {
    if (name === pendingKey) {
      Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: 'failed cleanup' } })
      done()
      Reflect.deleteProperty(chrome.runtime, 'lastError')
    } else remove(name, done)
  }
  await assert.rejects(client.pollDesktopPairing(pair), /failed cleanup/)
  assert.equal(await client.getDesktopCredential(), null)
  assert.deepEqual(fx.local, {})
})

test('disconnect cancels an outstanding pair and cannot save its late approved token', async t => {
  const fx = fixture(t)
  const pair = client.createDesktopPairing()
  await announce(pair)
  let release: (() => void) | undefined
  fx.respond(async url => {
    if (url.endsWith('/bridge/cancel')) return json({ success: true })
    await new Promise<void>(resolve => { release = resolve })
    return json({ state: 'approved', token })
  })
  const rejected = assert.rejects(client.pollDesktopPairing(pair), { name: 'AbortError' })
  while (!release) await new Promise(resolve => setTimeout(resolve, 1))
  await client.disconnectDesktop()
  release()
  await rejected
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 1 })
})

test('body and bearer cannot leave if the stored authorization is removed during identity verification', async t => {
  const fx = fixture(t, credential)
  globalThis.fetch = async (input, init) => {
    fx.calls.push({ url: String(input), init })
    delete fx.local[credentialKey]
    return json(signedProof(new URL(String(input)).searchParams.get('challenge')!))
  }
  await assert.rejects(client.requestDesktop('/api/inbox', { method: 'POST', headers: client.desktopHeaders(credential), body: 'private' }, undefined, 1000, credential), /身份/)
  assert.equal(fx.calls.length, 1)
  assert.equal(fx.calls[0].init?.body, undefined)
  assert.equal(authenticated(fx).length, 0)
})

test('credential changes use an origin-wide browser lock where supported across MV3 contexts', async t => {
  const fx = fixture(t)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const entered: string[] = []
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: async (name: string, work: () => Promise<unknown>) => { entered.push(name); return work() },
  } } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else Reflect.deleteProperty(globalThis, 'navigator') })
  const pair = client.createDesktopPairing()
  await announce(pair)
  fx.respond(async url => json(url.endsWith('/bridge/disconnect') ? { success: true } : { state: 'approved', token }))
  await client.pollDesktopPairing(pair)
  await client.disconnectDesktop()
  assert.deepEqual(entered, ['tb-desktop-credentials', 'tb-desktop-credentials'])
  assert.deepEqual(fx.local, { [DESKTOP_GENERATION_KEY]: 1 })
})
test('identity pins, endpoints and discovery remain excluded from backup and settings', async t => {
  fixture(t, credential)
  const { DEFAULT_SETTINGS } = await import('./settings.ts')
  const { parseBackup } = await import('./backup.ts')
  assert.deepEqual(parseBackup(JSON.stringify({ version: 1, data: {}, settings: { [credentialKey]: credential, [pendingKey]: credential, [DESKTOP_GENERATION_KEY]: 1, token, origin, endpoint, publicKey } })).settings, { enableRemoteQuotes: false })
  assert.equal(JSON.stringify(DEFAULT_SETTINGS).includes(token), false)
})
test('body byte limit accepts exactly 2 MiB but rejects one byte more', t => {
  fixture(t)
  const items = Array.from({ length: 11 }, () => ({ title: 'Test', url: 'https://example.com', content: 'a'.repeat(200000) }))
  items[10].content = ''
  const overhead = new TextEncoder().encode(client.createDesktopInboxRequest(items).body).byteLength
  items[10].content = 'a'.repeat(2 * 1024 * 1024 - overhead)
  assert.equal(new TextEncoder().encode(client.createDesktopInboxRequest(items).body).byteLength, 2 * 1024 * 1024)
  items[10].content += 'a'
  assert.throws(() => client.createDesktopInboxRequest(items), /2 MiB/)
})
