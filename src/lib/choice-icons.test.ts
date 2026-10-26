import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
// 依赖系统 emoji 字体的图标在缺字体的系统上会显示成方框
const emoji = /\p{Extended_Pictographic}/u

test('settings surfaces draw choice icons from the shared line-icon map instead of emoji', () => {
  for (const path of ['src/options/Options.tsx', 'src/newtab/views/SettingsModal.tsx']) {
    const source = read(path).replace(/✓/g, '')
    assert.doesNotMatch(source, emoji, path)
    assert.match(source, /from '(?:\.\.\/)+lib\/choice-icons'/, path)
  }
})

test('new-tab toolbar shortcuts and greeting do not rely on emoji fonts', () => {
  const source = read('src/newtab/NewTab.tsx')
  const shortcuts = source.slice(source.indexOf('const GROUP_SHORTCUTS'), source.indexOf('const NAV_ITEMS'))
  const greeting = source.slice(source.indexOf('function getGreeting'), source.indexOf('function getGreeting') + 400)
  assert.doesNotMatch(shortcuts, emoji)
  assert.doesNotMatch(greeting, emoji)
})

test('skin panel controls use line icons instead of emoji', () => {
  assert.doesNotMatch(read('src/newtab/views/SkinPanel.tsx'), emoji)
})
