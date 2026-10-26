import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderPolicyMarkdown } from '../../scripts/build-policies.mjs'

test('bundled policy renders bilingual disclosures without internal review notes', () => {
  const html = renderPolicyMarkdown('# Internal draft\nSecret review note\n## 中文\n### 数据\nLocal storage\n## English\n### Data\n[Contact](mailto:test@example.com)')
  assert.match(html, /<h2>中文<\/h2>/)
  assert.match(html, /<h2>English<\/h2>/)
  assert.match(html, /mailto:test@example.com/)
  assert.doesNotMatch(html, /Secret review note/)
})

test('policy markup escapes raw HTML and never embeds remote scripts', () => {
  const html = renderPolicyMarkdown('## 中文\n<script>bad()</script>\n[bad](javascript:alert)\n| field | data |\n| --- | --- |\n| URL | local |')
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script|href="javascript:/)
  assert.match(html, /<table>/)
})

for (const browser of ['CHROME', 'EDGE']) {
  test(`${browser} policy draft discloses explicit local pairing and non-exported credentials in both languages`, () => {
    const markdown = readFileSync(new URL(`../../docs/PRIVACY_${browser}.md`, import.meta.url), 'utf8')
    const html = renderPolicyMarkdown(markdown)
    assert.match(html, /djs321-desktop:\/\/pair/)
    assert.match(html, /X-DJS321-Client/)
    assert.match(html, /配对令牌[^。]*不进入[^。]*同步[^。]*备份/)
    assert.match(html, /pairing token[^\n]*not settings sync or JSON backup/i)
    assert.match(html, /断开配对/)
    assert.match(html, /Disconnect/)
    assert.match(html, /href="mailto:support@djs321.com"/)
    assert.deepEqual([...html.matchAll(/mailto:([^"?]+)/g)].map(match => match[1]).filter(address => address !== 'support@djs321.com'), [])
    assert.match(markdown, /NOT YET PUBLISHED/)
  })
}

test('all bundled privacy pages use the current public support address', () => {
  for (const name of ['privacy.html', 'privacy-chrome.html', 'privacy-edge.html']) {
    const html = readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8')
    assert.match(html, /href="mailto:support@djs321.com"/)
    assert.deepEqual([...html.matchAll(/mailto:([^"?]+)/g)].map(match => match[1]).filter(address => address !== 'support@djs321.com'), [])
    assert.match(html, /Preview data and network notice/)
    assert.doesNotMatch(html, /not yet publicly published/)
  }
})
