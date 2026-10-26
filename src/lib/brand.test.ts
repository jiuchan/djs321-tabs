import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BRAND_FALLBACK, brandName } from './brand.ts'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const messages = (locale: string) => JSON.parse(read(`public/_locales/${locale}/messages.json`))

test('manifest takes its name and description from _locales', () => {
  const manifest = JSON.parse(read('public/manifest.json'))
  assert.equal(manifest.default_locale, 'en')
  assert.equal(manifest.name, '__MSG_extName__')
  assert.equal(manifest.description, '__MSG_extDescription__')
})

test('locale names follow the confirmed brand and fit store limits', () => {
  assert.equal(messages('en').extName.message, 'DJS321 Tabs')
  assert.equal(messages('zh_CN').extName.message, '倒计时321 标签管家')
  for (const locale of ['en', 'zh_CN']) {
    const { extName, extDescription } = messages(locale)
    assert.ok(extName.message.length <= 75)
    assert.ok(extDescription.message.length <= 132)
  }
})

test('brandName falls back to the English wordmark outside the extension', () => {
  assert.equal(brandName(), BRAND_FALLBACK)
})

test('user-facing sources no longer show the old product name', () => {
  for (const path of ['src/popup/App.tsx', 'src/newtab/NewTab.tsx', 'src/options/Options.tsx', 'src/background/index.ts', 'src/popup/index.html', 'src/newtab/index.html', 'src/options/index.html', 'scripts/build-policies.mjs', 'docs/PRIVACY_CHROME.md', 'docs/PRIVACY_EDGE.md']) {
    assert.doesNotMatch(read(path), /Tab Butler|倒计时321 伴侣/, path)
  }
})
