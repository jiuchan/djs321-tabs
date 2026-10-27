import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatMessage, plural, t, uiLocale } from './i18n.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const messages = (locale: string): Record<string, { message: string; description?: string }> =>
  JSON.parse(readFileSync(join(root, `public/_locales/${locale}/messages.json`), 'utf8'))
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

test('t falls back to bundled English and fills placeholders outside the extension', () => {
  assert.equal(t('extName'), 'DJS321 Tabs')
  assert.equal(formatMessage('{count} of {total}', { count: 2, total: 5 }), '2 of 5')
  assert.equal(formatMessage('{missing} stays', {}), '{missing} stays')
  assert.equal(uiLocale(), 'en')
})

test('plural picks the singular key only for one', () => {
  const en = messages('en')
  const one = Object.keys(en).find(k => k.endsWith('_one'))
  if (!one) return
  const other = one.replace(/_one$/, '_other')
  assert.ok(en[other], `${other} pairs with ${one}`)
  assert.equal(plural(one as never, other as never, 1), formatMessage(en[one].message, { count: 1 }))
  assert.equal(plural(one as never, other as never, 3), formatMessage(en[other].message, { count: 3 }))
})

test('en and zh_CN define the same keys with the same placeholders', () => {
  const en = messages('en')
  const zh = messages('zh_CN')
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of Object.keys(en)) {
    assert.match(key, /^[A-Za-z0-9_]+$/, `chrome.i18n key ${key}`)
    assert.ok(en[key].message.trim(), `en ${key} is empty`)
    assert.ok(zh[key].message.trim(), `zh_CN ${key} is empty`)
    assert.doesNotMatch(en[key].message + zh[key].message, /\$/, `${key}: $ is reserved by chrome.i18n`)
    assert.deepEqual(placeholders(zh[key].message), placeholders(en[key].message), `${key} placeholders`)
    assert.doesNotMatch(en[key].message, /[一-鿿]/, `en ${key} contains Chinese`)
  }
})

// 界面代码不得再写死中文：注释可以是中文；确需匹配中文内容的行（如按标题识别分类）在行尾标 i18n-allow
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ''))
    .split('\n')
    .map(line => line.replace(/(^|[\s;,{}()])\/\/.*$/, '$1'))
    .join('\n')
}

test('stripComments keeps URLs inside strings', () => {
  assert.equal(stripComments("const a = 'https://x' // 注释").trim(), "const a = 'https://x'")
  assert.equal(stripComments('{/* 中文 */}<b/>').trim(), '{}<b/>')
})

test('UI sources contain no hard-coded Chinese', () => {
  const offenders: string[] = []
  for (const file of sourceFiles(join(root, 'src'))) {
    const raw = readFileSync(file, 'utf8')
    const lines = stripComments(raw).split('\n')
    raw.split('\n').forEach((line, index) => {
      if (/[\u4e00-\u9fff]/.test(lines[index]) && !line.includes('i18n-allow')) {
        offenders.push(`${file.slice(root.length)}:${index + 1}: ${line.trim().slice(0, 80)}`)
      }
    })
  }
  assert.deepEqual(offenders, [])
})
