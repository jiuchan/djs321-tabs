import test from 'node:test'
import assert from 'node:assert/strict'

import { handleTabActionMessage } from './message-handler.ts'

const tab = { id: 7, url: 'https://example.com', title: 'Test page' } as chrome.tabs.Tab
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test('archive reply waits for actual storage completion', async () => {
  let finish!: () => void
  let response: unknown
  const pending = new Promise<void>(resolve => { finish = resolve })
  assert.equal(handleTabActionMessage(
    { type: 'ARCHIVE_TAB', tabId: 7 },
    { getTab: (_id, cb) => cb(tab), archiveTab: () => pending },
    value => { response = value },
  ), true)
  assert.equal(response, undefined)
  finish()
  await settle()
  assert.deepEqual(response, { ok: true })
})

test('a missing tab returns a failure rather than false success', () => {
  let response: unknown
  handleTabActionMessage(
    { type: 'ARCHIVE_TAB', tabId: 99 },
    { getTab: (_id, cb) => cb(undefined, 'Tab not found'), archiveTab: async () => {} },
    value => { response = value }, () => {},
  )
  assert.deepEqual(response, { ok: false, error: 'Tab not found' })
})

test('storage failure reaches the sender', async () => {
  let response: unknown
  handleTabActionMessage(
    { type: 'CLOSE_AND_ARCHIVE', tabId: 7 },
    { getTab: (_id, cb) => cb(tab), archiveTab: async () => { throw new Error('database unavailable') } },
    value => { response = value }, () => {},
  )
  await settle()
  assert.deepEqual(response, { ok: false, error: 'database unavailable' })
})

test('close-and-archive returns the exact undo record only after completion', async () => {
  let response: unknown
  handleTabActionMessage(
    { type: 'CLOSE_AND_ARCHIVE', tabId: 7 },
    { getTab: (_id, cb) => cb(tab), archiveTab: async (_tab, close) => {
      assert.equal(close, true)
      return { undoId: 42 }
    } },
    value => { response = value },
  )
  await settle()
  assert.deepEqual(response, { ok: true, undoIds: [42] })
})

test('invalid tab ids fail and unrelated messages are not claimed', () => {
  for (const tabId of [undefined, NaN, -1, 1.2]) {
    let response: unknown
    handleTabActionMessage(
      { type: 'ARCHIVE_TAB', tabId },
      { getTab: () => assert.fail('invalid id queried'), archiveTab: async () => {} },
      value => { response = value },
    )
    assert.deepEqual(response, { ok: false, error: 'Invalid tabId' })
  }
  assert.equal(handleTabActionMessage({}, {
    getTab: () => assert.fail(), archiveTab: async () => {},
  }, () => assert.fail()), false)
})
