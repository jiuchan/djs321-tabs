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

test('product screenshots use a readable landscape desktop viewport with synthetic-data provenance', () => {
  for (const name of ['workspace-en.jpg', 'workspace-zh-CN.jpg', 'tabs-en.jpg']) {
    const path = `docs/images/${name}`
    assert.ok(existsSync(new URL(path, root)), path)
    const bytes = readFileSync(new URL(path, root))
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', path)
    assert.equal(bytes.subarray(-2).toString('hex'), 'ffd9', path)
    let width = 0
    let height = 0
    // JPEG frame headers carry the capture dimensions without an image-library dependency.
    for (let offset = 2; offset + 9 < bytes.length;) {
      assert.equal(bytes[offset], 0xff, `${path}: JPEG segment`)
      const marker = bytes[offset + 1]
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = bytes.readUInt16BE(offset + 5)
        width = bytes.readUInt16BE(offset + 7)
        break
      }
      if (marker === 0xda) break
      const size = bytes.readUInt16BE(offset + 2)
      assert.ok(size >= 2, `${path}: valid JPEG segment length`)
      offset += 2 + size
    }
    assert.ok(width >= 1280 && height >= 720, `${path}: readable desktop resolution`)
    assert.ok(width / height >= 1.5 && width / height <= 1.9, `${path}: desktop landscape, not a portrait page`)
    assert.ok(bytes.length > 10_000 && bytes.length < 2 * 1024 * 1024, `${path}: reasonable README image weight`)
  }
  assert.match(read('docs/images/README.md'), /synthetic/i)
  assert.match(read('docs/images/README.md'), /1\.1\.0/)
})
