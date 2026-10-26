import test from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from './retry.ts'
import { normalizeApiUrl, DEFAULT_JUSTDOIT_API_URL } from './settings.ts'

test('withRetry：首次成功只调用一次', async () => {
  let calls = 0
  const r = await withRetry(async () => { calls++; return 'ok' }, { baseDelayMs: 0 })
  assert.equal(r, 'ok')
  assert.equal(calls, 1)
})

test('withRetry：失败 N 次后成功（retries=2 → 最多 3 次）', async () => {
  let calls = 0
  const r = await withRetry(async () => { calls++; if (calls < 3) throw new Error('x'); return 'ok' }, { retries: 2, baseDelayMs: 0 })
  assert.equal(r, 'ok')
  assert.equal(calls, 3)
})

test('withRetry：一直失败在 retries+1 次后抛出', async () => {
  let calls = 0
  await assert.rejects(() => withRetry(async () => { calls++; throw new Error('boom') }, { retries: 2, baseDelayMs: 0 }))
  assert.equal(calls, 3)
})

test('withRetry：retryable=false 的错误不重试', async () => {
  let calls = 0
  await assert.rejects(() =>
    withRetry(async () => { calls++; throw Object.assign(new Error('4xx'), { retryable: false }) }, { retries: 2, baseDelayMs: 0 })
  )
  assert.equal(calls, 1)
})

test('normalizeApiUrl：去尾斜杠 / 去空白', () => {
  assert.equal(normalizeApiUrl('http://localhost:37373/'), 'http://localhost:37373')
  assert.equal(normalizeApiUrl('  http://127.0.0.1:8080  '), 'http://127.0.0.1:8080')
  assert.equal(normalizeApiUrl('https://nas.local:5000/dav'), 'https://nas.local:5000/dav')
})

test('normalizeApiUrl：空 / 非法 / 非 http(s) 回退默认', () => {
  assert.equal(normalizeApiUrl(''), DEFAULT_JUSTDOIT_API_URL)
  assert.equal(normalizeApiUrl(null), DEFAULT_JUSTDOIT_API_URL)
  assert.equal(normalizeApiUrl('not a url'), DEFAULT_JUSTDOIT_API_URL)
  assert.equal(normalizeApiUrl('ftp://x'), DEFAULT_JUSTDOIT_API_URL)
})
