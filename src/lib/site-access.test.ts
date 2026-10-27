import test from 'node:test'
import assert from 'node:assert/strict'
import * as access from './site-access.ts'

test('capture permission patterns are exact site hosts, never all URLs', () => {
  assert.deepEqual(access.captureOrigins(['https://example.com/a', 'https://example.com/b', 'http://localhost:4321/page']), ['https://example.com/*', 'http://localhost:4321/*'])
  for (const url of ['chrome://settings', 'file:///tmp/test.html', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://*', 'https://%2A', 'https://*.example.com', 'https://store.test.evil/']) {
    if (url === 'https://store.test.evil/') assert.deepEqual(access.captureOrigins([url]), ['https://store.test.evil/*'])
    else assert.throws(() => access.captureOrigins([url]))
  }
})

test('request only specified origins and stop on user denial', async () => {
  const requested: string[][] = []
  await assert.rejects(() => access.requestCaptureAccess(['https://example.com/page'], {
    request: async origins => { requested.push(origins); return false },
  }), /granted/)
  assert.deepEqual(requested, [['https://example.com/*']])
  await access.requestCaptureAccess(['https://example.com/page'], { request: async () => true })
})

test('revoking optional sites preserves mandatory all-port localhost permission only', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'chrome')
  let removed: string[] = []
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: { permissions: {
    getAll: async () => ({ origins: ['http://localhost/*', 'https://example.com/*', 'http://127.0.0.1/*'] }),
    remove: async ({ origins }: { origins: string[] }) => { removed = origins; return true },
  } } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'chrome', previous); else Reflect.deleteProperty(globalThis, 'chrome') })
  await access.revokeOptionalSiteAccess()
  assert.deepEqual(removed, ['https://example.com/*', 'http://127.0.0.1/*'])
})
