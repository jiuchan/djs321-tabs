import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('extractor build cannot overwrite the generated extension manifest', () => {
  const config = readFileSync(new URL('../../vite.content.config.ts', import.meta.url), 'utf8')
  assert.match(config, /publicDir:\s*false/)
})
