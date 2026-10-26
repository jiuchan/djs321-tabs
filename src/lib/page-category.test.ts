import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inferPageCategory } from './page-category.ts'

test('SkillHub and its own subdomains are AI resources', () => {
  assert.equal(inferPageCategory('https://skillhub.cn/'), '🤖 AI 助手')
  assert.equal(inferPageCategory('https://www.skillhub.cn/skills'), '🤖 AI 助手')
  assert.equal(inferPageCategory('https://skillhub.cn.example.com/'), '默认')
})

test('unknown URLs can use an explicit AI title, not an incidental substring', () => {
  assert.equal(inferPageCategory('https://example.com/', 'AI Skills 社区'), '🤖 AI 助手')
  assert.equal(inferPageCategory('https://example.com/', '每日分享'), '默认')
  assert.equal(inferPageCategory('https://example.com/', 'Daily Mail'), '默认')
})

test('query and hash references to unrelated websites do not classify the current page', () => {
  assert.equal(inferPageCategory('https://example.com/?ref=spotify.com#openai'), '默认')
  assert.equal(inferPageCategory('https://openai.com/'), '🤖 AI 助手')
  assert.equal(inferPageCategory('https://github.com/example/repo'), '💻 开发工具')
  assert.equal(inferPageCategory('https://spotify.com/'), '🎵 音乐')
  assert.equal(inferPageCategory('not a URL', 'AI Skills'), '默认')
})

test('brand substrings in unrelated hostnames and article paths do not imply a category', () => {
  for (const url of [
    'https://openai.com.example.com/', 'https://poetryfoundation.org/',
    'https://example.com/spotify', 'https://example.com/openai',
  ]) assert.equal(inferPageCategory(url), '默认', url)
})

test('specific mail and document services beat generic development and music rules', () => {
  assert.equal(inferPageCategory('https://mail.163.com/'), '📧 邮件')
  assert.equal(inferPageCategory('https://music.163.com/'), '🎵 音乐')
  assert.equal(inferPageCategory('https://docs.google.com/document/d/123'), '📄 文档协作')
  assert.equal(inferPageCategory('https://docs.example.com/'), '💻 开发工具')
})

test('popup, new tab grouping and navigation editor share the tested classifier', () => {
  for (const path of ['../popup/App.tsx', '../newtab/groupers.ts', '../newtab/views/QuickLinksView.tsx']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.ok(source.includes('inferPageCategory('), path)
    assert.ok(!source.includes('regex.test('), path)
  }
})
