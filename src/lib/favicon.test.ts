import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getQuickLinkFallbackLabel, localFaviconUrl } from './favicon.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('localFaviconUrl is unavailable outside the extension', () => {
  assert.equal(localFaviconUrl('https://example.com/'), undefined)
})

test('localFaviconUrl builds a _favicon URL for web pages only', () => {
  const g = globalThis as { chrome?: unknown }
  const previous = g.chrome
  g.chrome = { runtime: { getURL: (path: string) => `chrome-extension://abc${path}` } }
  try {
    const url = new URL(localFaviconUrl('https://example.com/a?b=1#c', 64)!)
    assert.ok(url.href.startsWith('chrome-extension://abc/_favicon/?'))
    assert.equal(url.searchParams.get('pageUrl'), 'https://example.com/a?b=1#c')
    assert.equal(url.searchParams.get('size'), '64')
    assert.equal(localFaviconUrl('chrome://settings'), undefined)
    assert.equal(localFaviconUrl('javascript:alert(1)'), undefined)
    assert.equal(localFaviconUrl(undefined), undefined)
  } finally {
    g.chrome = previous
  }
})

test('quick link fallback label uses the first letter or digit', () => {
  assert.equal(getQuickLinkFallbackLabel('github', ''), 'G')
  assert.equal(getQuickLinkFallbackLabel('', 'https://9gag.com'), 'H')
})

test('manifest requests the favicon permission', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.json'), 'utf8'))
  assert.ok(manifest.permissions.includes('favicon'))
})

// 渲染图标不得再使用浏览器上报的远程地址或第三方图标服务
test('UI never renders remote favicon URLs', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
  for (const file of files(join(root, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /favIconUrl|s2\/favicons|gstatic\.com/, file)
  }
})
