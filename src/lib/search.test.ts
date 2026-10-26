import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSearchUrl } from './search.ts'

const engine = 'https://www.google.com/search?q='

test('search keeps decimal versions and dotted prose as search terms', () => {
  for (const text of ['React 19.2', 'release v1.0', 'hello. world', 'file.ts']) {
    assert.equal(resolveSearchUrl(text, engine), `${engine}${encodeURIComponent(text)}`)
  }
})

test('search accepts explicit HTTP URLs and bare public domains', () => {
  assert.equal(resolveSearchUrl(' https://example.com/guide?q=1 ', engine), 'https://example.com/guide?q=1')
  assert.equal(resolveSearchUrl('example.com/guide', engine), 'https://example.com/guide')
  assert.equal(resolveSearchUrl('docs.example.org', engine), 'https://docs.example.org/')
  assert.equal(resolveSearchUrl('localhost:37373', engine), 'http://localhost:37373/')
  assert.equal(resolveSearchUrl('127.0.0.1:37373/home', engine), 'http://127.0.0.1:37373/home')
  assert.equal(resolveSearchUrl('192.168.1.20', engine), 'http://192.168.1.20/')
  assert.equal(resolveSearchUrl('999.168.1.20', engine), `${engine}999.168.1.20`)
})

test('empty queries do not navigate and non-HTTP schemes remain search terms', () => {
  assert.equal(resolveSearchUrl('  ', engine), null)
  for (const text of ['javascript:alert(1)', 'file:///tmp/a.txt', 'chrome://settings', 'edge://newtab']) {
    assert.equal(resolveSearchUrl(text, engine), `${engine}${encodeURIComponent(text)}`)
  }
})
