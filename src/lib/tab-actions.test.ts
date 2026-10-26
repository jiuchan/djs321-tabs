import test from 'node:test'
import assert from 'node:assert/strict'
import * as actions from './tab-actions.ts'
const { requestTabAction } = actions

test('tab action rejects failed or missing responses', async () => {
  for (const response of [undefined, null, {}, { ok: false, error: 'save failed' }]) {
    await assert.rejects(() => requestTabAction({ type: 'ARCHIVE_TAB', tabId: 1 }, async () => response))
  }
})

test('tab action forwards exact successful undo ids', async () => {
  assert.deepEqual(await requestTabAction({ type: 'CLOSE_AND_ARCHIVE', tabId: 1 }, async () => ({ ok: true, undoIds: [3] })), { ok: true, undoIds: [3] })
})

test('undo opens the recorded URLs, not another recent browser session', async () => {
  const opened: string[] = []
  const removed: number[] = []
  const records = new Map([[42, { url: 'https://example.com/first' }], [45, { url: 'https://example.com/second' }]])
  assert.equal(await actions.restoreUndoRecords([42, 45, 42], {
    get: async id => records.get(id),
    open: async url => { opened.push(url) },
    remove: async id => { removed.push(id) },
  }), 2)
  assert.deepEqual(opened, ['https://example.com/first', 'https://example.com/second'])
  assert.deepEqual(removed, [42, 45])
})

test('failed undo leaves the record available for retry', async () => {
  let removed = false
  await assert.rejects(() => actions.restoreUndoRecords([42], {
    get: async () => ({ url: 'https://example.com' }),
    open: async () => { throw new Error('browser failure') },
    remove: async () => { removed = true },
  }), /browser failure/)
  assert.equal(removed, false)
})

test('undo rejects invalid ids and unsafe URLs before opening', async () => {
  for (const ids of [null, [], [0], [-1], [1.5], [NaN], ['42'], Array.from({ length: 201 }, (_, i) => i + 1)]) {
    await assert.rejects(() => actions.restoreUndoRecords(ids, {
      get: async () => assert.fail(), open: async () => assert.fail(), remove: async () => assert.fail(),
    }))
  }
  await assert.rejects(() => actions.restoreUndoRecords([42], {
    get: async () => ({ url: 'javascript:alert(1)' }),
    open: async () => assert.fail(), remove: async () => assert.fail(),
  }))
})

test('concurrent undo calls restore each record only once', async () => {
  const records = new Map([[42, { url: 'https://example.com' }]])
  const opened: string[] = []
  const restore = actions.createUndoRestorer({
    get: async id => records.get(id),
    open: async url => { await new Promise(resolve => setTimeout(resolve, 5)); opened.push(url) },
    remove: async id => { records.delete(id) },
  })
  assert.deepEqual(await Promise.all([restore([42]), restore([42])]), [1, 0])
  assert.deepEqual(opened, ['https://example.com'])
})

test('a failed queued undo does not block a later retry', async () => {
  let fails = true
  const restore = actions.createUndoRestorer({
    get: async () => ({ url: 'https://example.com' }),
    open: async () => { if (fails) throw new Error('offline') },
    remove: async () => {},
  })
  await assert.rejects(() => restore([42]), /offline/)
  fails = false
  assert.equal(await restore([42]), 1)
})

test('large undo batches use bounded requests without dropping records', async () => {
  const chunks: number[][] = []
  const ids = Array.from({ length: 401 }, (_, i) => i + 1)
  await actions.requestUndoActions([...ids, 1], async message => {
    chunks.push(message.undoIds!)
    return { ok: true }
  })
  assert.deepEqual(chunks.map(chunk => chunk.length), [200, 200, 1])
  assert.deepEqual(chunks.flat(), ids)
})
