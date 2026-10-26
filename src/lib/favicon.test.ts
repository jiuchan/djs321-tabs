import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getRenderableFaviconUrl,
  isNoisyFaviconServiceUrl,
  pickPersistableFaviconUrl,
} from './favicon.ts'

test('isNoisyFaviconServiceUrl detects Google favicon service URLs that can spam 404s', () => {
  assert.equal(isNoisyFaviconServiceUrl('https://www.google.com/s2/favicons?sz=64&domain_url=example.com'), true)
  assert.equal(isNoisyFaviconServiceUrl('https://t1.gstatic.com/faviconV2?client=SOCIAL&url=http://example.com&size=64'), true)
  assert.equal(isNoisyFaviconServiceUrl('https://example.com/favicon.ico'), false)
})

test('getRenderableFaviconUrl hides noisy favicon service URLs but keeps normal icons', () => {
  assert.equal(getRenderableFaviconUrl('https://www.google.com/s2/favicons?sz=64&domain_url=example.com'), undefined)
  assert.equal(getRenderableFaviconUrl('https://example.com/favicon.ico'), 'https://example.com/favicon.ico')
})

test('pickPersistableFaviconUrl avoids creating Google fallback icon URLs', () => {
  assert.equal(pickPersistableFaviconUrl('https://example.com/favicon.ico'), 'https://example.com/favicon.ico')
  assert.equal(pickPersistableFaviconUrl('https://t3.gstatic.com/faviconV2?url=http://example.com'), undefined)
  assert.equal(pickPersistableFaviconUrl(undefined), undefined)
})
