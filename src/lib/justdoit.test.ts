import test from 'node:test'
import assert from 'node:assert/strict'
import { extractMarkdownFromTab, sendToJustDoIt } from './justdoit.ts'
import { credential, endpoint, signedProof, json } from './desktop-fixture.test.ts'

function fixture(t: test.TestContext, initialUrl = 'https://example.com/article', base = 'http://localhost:37373', paired = true) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
  let url = initialUrl
  let injections = 0
  let extracted: { content?: string | null; error?: string } = { content: '# Test article' }
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    runtime: { id: 'a'.repeat(32) },
    tabs: {
      get: async () => ({ url }),
      sendMessage: (_id: number, _message: unknown, callback: (result: unknown) => void) => callback(extracted),
    },
    scripting: { executeScript: async () => { injections++ } },
    permissions: { contains: async () => true },
    storage: {
      sync: { get: (_defaults: unknown, callback: (result: unknown) => void) => callback({ justdoitApiUrl: base }) },
      local: { get: (_key: string, callback: (result: unknown) => void) => callback(paired ? { tb_desktop_connection: credential } : {}) },
    },
  } })
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'chrome', prior)
    else Reflect.deleteProperty(globalThis, 'chrome')
  })
  return { setUrl: (next: string) => { url = next }, injections: () => injections, setExtraction: (next: typeof extracted) => { extracted = next } }
}

function localTransport(t: test.TestContext, handler: typeof fetch) {
  const previous = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/bridge/identity') {
      assert.equal(url.origin, endpoint)
      assert.equal(new Headers(init?.headers).has('Authorization'), false)
      assert.equal(init?.body, undefined)
      return json(signedProof(url.searchParams.get('challenge')!))
    }
    assert.equal(url.origin, endpoint)
    return handler(input, init)
  }
  t.after(() => { globalThis.fetch = previous })
}

test('article extraction is action-only and verifies the selected URL', async t => {
  const fx = fixture(t)
  assert.equal(fx.injections(), 0)
  assert.equal(await extractMarkdownFromTab(1, 'https://example.com/article'), '# Test article')
  fx.setUrl('https://example.com/private')
  await assert.rejects(() => extractMarkdownFromTab(1, 'https://example.com/article'), /变化/)
  assert.equal(fx.injections(), 1)
})

test('article extraction distinguishes no article from a failed extractor', async t => {
  const fx = fixture(t)
  fx.setExtraction({ content: null })
  assert.equal(await extractMarkdownFromTab(1, 'https://example.com/article'), undefined)
  fx.setExtraction({ error: 'extraction failed' })
  await assert.rejects(() => extractMarkdownFromTab(1, 'https://example.com/article'), /extraction failed/)
})

test('inbox transmission cannot follow redirects or include cookies', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  let received: RequestInit | undefined
  localTransport(t, async (_input, init) => {
    received = init
    const body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ success: true, requestId: body.requestId, count: body.items?.length }), { status: 200 })
  })
  t.after(() => { globalThis.fetch = previousFetch })
  await sendToJustDoIt({ title: 'Disposable test', url: 'https://example.com/article' })
  assert.equal(received?.redirect, 'error')
  assert.equal(received?.credentials, 'omit')
  assert.equal(received?.referrerPolicy, 'no-referrer')
  const headers = new Headers(received?.headers)
  assert.equal(headers.get('Authorization'), `Bearer ${'b'.repeat(64)}`)
  assert.equal(headers.get('X-DJS321-Client'), `chrome-extension://${'a'.repeat(32)}`)
  assert.equal(headers.has('Origin'), false)
})

test('local unpaired send fails with settings guidance before any HTTP request', async t => {
  fixture(t, undefined, undefined, false)
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{"success":true}') }
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt({ title: 'Test', url: 'https://example.com' }), /插件设置.*配对/)
  assert.equal(calls, 0)
})

test('local retries reuse the same UUID and exact authenticated items envelope', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  const bodies: string[] = []
  localTransport(t, async (_url, init) => {
    bodies.push(String(init?.body))
    if (bodies.length === 1) return new Response('{}', { status: 503 })
    const body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ success: true, requestId: body.requestId, count: 2 }))
  })
  t.after(() => { globalThis.fetch = previousFetch })
  assert.equal(await sendToJustDoIt([{ title: 'One', url: 'https://example.com/1' }, { title: 'Two', url: 'https://example.com/2' }]), true)
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0], bodies[1])
  const body = JSON.parse(bodies[0])
  assert.match(body.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(body.items.length, 2)
  assert.equal(body.items[0].source, 'tab-butler')
})

for (const response of [{ success: true }, { success: 'yes', count: 1 }, { success: true, requestId: 'other', count: 1 }, { success: true, count: 2 }]) {
  test(`local send rejects mismatched receipt ${JSON.stringify(response)} without retry or unsigned fallback`, async t => {
    fixture(t)
    const previousFetch = globalThis.fetch
    let calls = 0
    localTransport(t, async (_url, init) => {
      calls++
      const body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ requestId: body.requestId, ...response }))
    })
    t.after(() => { globalThis.fetch = previousFetch })
    await assert.rejects(sendToJustDoIt({ title: 'Test', url: 'https://example.com' }), /回执|设置/)
    assert.equal(calls, 1)
  })
}

test('revoked authentication is actionable and never retries unsigned', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  let calls = 0
  localTransport(t, async () => { calls++; return new Response('{}', { status: 401 }) })
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt({ title: 'Test', url: 'https://example.com' }), /撤销.*插件设置.*配对/)
  assert.equal(calls, 1)
})

test('advanced HTTPS preserves permissions, legacy bodies and headers without leaking local credentials', async t => {
  fixture(t, undefined, 'https://trusted.example/service')
  const previousFetch = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('{"success":true}') }
  t.after(() => { globalThis.fetch = previousFetch })
  await sendToJustDoIt({ title: 'Single', url: 'https://example.com' })
  await sendToJustDoIt([{ title: 'Array', url: 'https://example.com' }])
  assert.equal(calls[0].url, 'https://trusted.example/service/api/inbox')
  assert.equal(JSON.parse(String(calls[0].init?.body)).title, 'Single')
  assert.ok(Array.isArray(JSON.parse(String(calls[1].init?.body))))
  assert.deepEqual(calls[0].init?.headers, { 'Content-Type': 'application/json' })
})

test('advanced HTTPS still requires the existing per-endpoint permission', async t => {
  fixture(t, undefined, 'https://trusted.example/service')
  chrome.permissions.contains = async () => false
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{"success":true}') }
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt(validItem), /保存并授权/)
  assert.equal(calls, 0)
})

test('alternate loopback addresses cannot fall back to the legacy unsigned protocol', async t => {
  fixture(t, undefined, 'http://127.0.0.1:37373')
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('{"success":true}') }
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt({ title: 'Test', url: 'https://example.com' }), /自动本机/)
  assert.equal(calls, 0)
})

for (const base of ['http://localhost:37374', 'https://localhost:37373', 'http://127.0.0.1:37374', 'http://[::1]:37373', 'http://localhost:37373/other']) {
  test(`custom loopback ${base} cannot receive the paired token or an unsigned fallback`, async t => {
    fixture(t, undefined, base)
    const previousFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response('{"success":true}') }
    t.after(() => { globalThis.fetch = previousFetch })
    await assert.rejects(sendToJustDoIt({ title: 'Test', url: 'https://example.com' }), /自动本机/)
    assert.equal(calls, 0)
  })
}

const validItem = { title: 'Test', url: 'https://example.com' }
test('local payload accepts exactly 100 items and individual field limits', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  localTransport(t, async (_url, init) => {
    const { requestId, items } = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ success: true, requestId, count: items.length }))
  })
  t.after(() => { globalThis.fetch = previousFetch })
  assert.equal(await sendToJustDoIt(Array.from({ length: 100 }, () => validItem)), true)
  assert.equal(await sendToJustDoIt({ title: 'a'.repeat(512), url: 'a'.repeat(8192), note: 'a'.repeat(16384), content: 'a'.repeat(200000) }), true)
})

test('malformed local JSON receipt fails once with actionable guidance', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  let calls = 0
  localTransport(t, async () => { calls++; return new Response('invalid json') })
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt(validItem), /回执.*插件设置/)
  assert.equal(calls, 1)
})
for (const [name, items] of [
  ['empty', []], ['101 items', Array.from({ length: 101 }, () => validItem)],
  ['title', [{ ...validItem, title: 'a'.repeat(513) }]], ['url', [{ ...validItem, url: 'a'.repeat(8193) }]],
  ['note', [{ ...validItem, note: 'a'.repeat(16385) }]], ['content', [{ ...validItem, content: 'a'.repeat(200001) }]],
  ['UTF-8 byte limit', Array.from({ length: 4 }, () => ({ ...validItem, content: '中'.repeat(200000) }))],
] as const) {
  test(`local payload rejects ${name} before HTTP`, async t => {
    fixture(t)
    const previousFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => { calls++; return new Response('{"success":true}') }
    t.after(() => { globalThis.fetch = previousFetch })
    await assert.rejects(sendToJustDoIt([...items]), /上限|1.*100/)
    assert.equal(calls, 0)
  })
}

test('wrong local identity fails once before any content or token, with no automatic fallback', async t => {
  fixture(t)
  const previousFetch = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), init }); return json({ success: true }) }
  t.after(() => { globalThis.fetch = previousFetch })
  await assert.rejects(sendToJustDoIt(validItem), /身份/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init?.body, undefined)
  assert.equal(new Headers(calls[0].init?.headers).has('Authorization'), false)
})
