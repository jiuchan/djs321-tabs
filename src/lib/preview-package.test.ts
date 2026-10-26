import assert from 'node:assert/strict'
import test from 'node:test'
import { isReleaseEntry } from '../../scripts/package-preview.mjs'

test('preview packages allow built runtime files and reject private or source files', () => {
  for (const name of ['manifest.json', 'assets/page.js', 'content-extractor.js', 'src/newtab/index.html', 'icons/icon128.png', 'privacy.html', '_locales/en/messages.json', '_locales/zh_CN/messages.json']) {
    assert.equal(isReleaseEntry(name), true, name)
  }
  for (const name of ['../secret', '/manifest.json', '.env', 'assets/app.js.map', 'src/index.ts', 'src/App.tsx', '.git/config', 'node_modules/test.js', 'design/index.html', 'test-results/log.txt', 'key.pem', '.DS_Store', 'fixture.js', '_locales/en/notes.txt']) {
    assert.equal(isReleaseEntry(name), false, name)
  }
})
