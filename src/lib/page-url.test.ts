import test from 'node:test'
import assert from 'node:assert/strict'
import { isBrowserContentUrl, tabsInWindow } from './page-url.ts'
import * as pageUrl from './page-url.ts'

type TestTab = { id: number; url?: string; pendingUrl?: string }

function observeFixture() {
  assert.equal(typeof pageUrl.observeBrowserTabs, 'function', 'open tabs must track browser events')
  const listeners = new Set<() => void>()
  const event = {
    addListener: (listener: () => void) => { listeners.add(listener) },
    removeListener: (listener: () => void) => { listeners.delete(listener) },
  }
  const queries: Array<(tabs: TestTab[]) => void> = []
  const published: TestTab[][] = []
  const dispose = pageUrl.observeBrowserTabs<TestTab>(
    callback => { queries.push(callback) }, [event], tabs => { published.push(tabs) },
  )
  return { queries, published, dispose, listeners, change: () => listeners.forEach(listener => listener()) }
}

test('restored tabs enter the workspace when their navigation commits', () => {
  const f = observeFixture()
  f.queries[0]([])
  f.change()
  f.queries[1]([{ id: 1, pendingUrl: 'https://example.com/?undo' }])
  assert.deepEqual(f.published.at(-1), [])
  f.change()
  f.queries[2]([{ id: 1, url: 'https://example.com/?undo' }, { id: 2, url: 'chrome://newtab/' }])
  assert.deepEqual(f.published.at(-1), [{ id: 1, url: 'https://example.com/?undo' }])
  f.dispose()
})

test('stale tab query callbacks cannot overwrite a newer snapshot', () => {
  const f = observeFixture()
  f.change()
  f.queries[1]([{ id: 2, url: 'https://example.com/new' }])
  f.queries[0]([{ id: 1, url: 'https://example.com/old' }])
  assert.deepEqual(f.published, [[{ id: 2, url: 'https://example.com/new' }]])
  f.dispose()
})

test('disposing the workspace removes listeners and ignores pending tab queries', () => {
  const f = observeFixture()
  assert.equal(f.listeners.size, 1)
  f.dispose()
  assert.equal(f.listeners.size, 0)
  f.queries[0]([{ id: 1, url: 'https://example.com/' }])
  f.change()
  assert.deepEqual(f.published, [])
  assert.equal(f.queries.length, 1)
})

test('browser chrome is not offered as a task or a manageable page', () => {
  for (const url of ['edge://newtab/', 'chrome://settings/', 'chrome-extension://id/index.html', 'about:blank', undefined]) {
    assert.equal(isBrowserContentUrl(url), false)
  }
  for (const url of ['https://example.com', 'http://localhost:37373', 'file:///tmp/example.pdf']) {
    assert.equal(isBrowserContentUrl(url), true)
  }
})

test('whole-window capture cannot include pages from a different window', () => {
  const tabs = [{ id: 1, windowId: 10 }, { id: 2, windowId: 20 }, { id: 3, windowId: 10 }]
  assert.deepEqual(tabsInWindow(tabs, 10).map(tab => tab.id), [1, 3])
  assert.deepEqual(tabsInWindow(tabs, undefined), [])
})
