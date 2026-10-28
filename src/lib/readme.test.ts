import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, root), 'utf8')

test('the default README is English with a reciprocal Simplified Chinese entry', () => {
  const en = read('README.md')
  const zh = read('README.zh-CN.md')
  assert.match(en, /# DJS321 Tabs/)
  assert.match(en, /README\.zh-CN\.md/)
  assert.match(zh, /\[English\]\(README\.md\)/)
  assert.match(en, /docs\/images\/workspace-en\.jpg/)
  assert.match(zh, /docs\/images\/workspace-zh-CN\.jpg/)
})

test('both readers get a usable preview download, upgrade, privacy and contribution path', () => {
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const text = read(name)
    for (const target of ['docs/PREVIEW_INSTALL.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', 'TRADEMARKS.md', 'PRIVACY.md']) assert.ok(text.includes(target), `${name}: ${target}`)
    assert.match(text, /https:\/\/djs321\.com\/(?:en|zh-Hans)\/#tab-butler-download/)
    assert.match(text, /npm ci/)
    assert.match(text, /npm run build/)
    assert.match(text, /1\.1\.0/)
  }
  assert.match(read('README.md'), /no automatic updates/i)
  assert.match(read('README.md'), /browser.*(?:UI|interface) language/i)
})

test('README local links and images resolve inside the public repository', () => {
  for (const name of ['README.md', 'README.zh-CN.md']) {
    const text = read(name)
    const links = [...text.matchAll(/\]\(([^)]+)\)/g), ...text.matchAll(/(?:src|href)="([^"]+)"/g)]
    for (const [, href] of links) {
      if (/^(?:https?:|mailto:|#)/.test(href)) continue
      const path = href.split('#')[0]
      assert.ok(!path.startsWith('/') && !path.includes('..'), `${name}: portable link ${href}`)
      assert.ok(existsSync(new URL(path, root)), `${name}: missing ${href}`)
    }
  }
})

test('product screenshots are committed JPEGs with recorded synthetic-data provenance', () => {
  for (const name of ['workspace-en.jpg', 'workspace-zh-CN.jpg', 'tabs-en.jpg']) {
    const path = `docs/images/${name}`
    assert.ok(existsSync(new URL(path, root)), path)
    const bytes = readFileSync(new URL(path, root))
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', path)
    assert.equal(bytes.subarray(-2).toString('hex'), 'ffd9', path)
    assert.ok(bytes.length > 10_000 && bytes.length < 2 * 1024 * 1024, `${path}: reasonable README image weight`)
  }
  assert.match(read('docs/images/README.md'), /synthetic/i)
  assert.match(read('docs/images/README.md'), /1\.1\.0/)
})
