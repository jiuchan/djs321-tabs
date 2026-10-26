import test from 'node:test'
import assert from 'node:assert/strict'
import * as settings from './settings.ts'

function storageFixture(t: test.TestContext, stored: Record<string, unknown> = {}) {
  const descriptors = ['chrome', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const writes: Record<string, unknown>[] = []
  const localWrites: string[] = []
  let requested: Record<string, unknown> = {}
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    storage: { sync: {
      get(defaults: Record<string, unknown>, cb: (result: object) => void) {
        requested = defaults
        cb({ ...defaults, ...stored })
      },
      set(value: Record<string, unknown>, cb: () => void) { writes.push(value); cb() },
    } },
  } })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { return null },
    setItem(key: string) { localWrites.push(key) },
  } })
  t.after(() => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  return { writes, localWrites, requested: () => requested }
}

test('navigation layout defaults to top for existing installations', async t => {
  const fixture = storageFixture(t)
  assert.equal(settings.DEFAULT_SETTINGS.navigationLayout, 'top')
  assert.equal((await settings.loadSettings()).navigationLayout, 'top')
  assert.equal(fixture.requested().navigationLayout, 'top')
})

test('navigation layout accepts top, sidebar and classic only', () => {
  assert.equal(typeof settings.normalizeNavigationLayout, 'function')
  for (const value of ['top', 'sidebar', 'classic']) assert.equal(settings.normalizeNavigationLayout(value), value)
  for (const value of [undefined, null, '', 'side', 1, {}, []]) {
    assert.equal(settings.normalizeNavigationLayout(value), 'top')
  }
})

test('stored sidebar preference loads without changing navigation order', async t => {
  const navOrder = ['bookmarks', 'tabs', 'quicklinks']
  storageFixture(t, { navigationLayout: 'sidebar', navOrder })
  const loaded = await settings.loadSettings()
  assert.equal(loaded.navigationLayout, 'sidebar')
  assert.deepEqual(loaded.navOrder, navOrder)
})

test('stored classic preference loads without changing other preferences', async t => {
  storageFixture(t, { navigationLayout: 'classic', viewMode: 'list', theme: 'dark' })
  const loaded = await settings.loadSettings()
  assert.equal(loaded.navigationLayout, 'classic')
  assert.equal(loaded.viewMode, 'list')
  assert.equal(loaded.theme, 'dark')
})

test('invalid imported or removed layout values fall back to top', async t => {
  storageFixture(t, { navigationLayout: 'obsolete-layout' })
  assert.equal((await settings.loadSettings()).navigationLayout, 'top')
})

test('saving a layout writes only the sync preference, not wallpaper or collection data', async t => {
  const fixture = storageFixture(t)
  await settings.saveSetting('navigationLayout', 'sidebar')
  assert.deepEqual(fixture.writes, [{ navigationLayout: 'sidebar' }])
  assert.deepEqual(fixture.localWrites, [])
})

test('saving classic writes only the layout preference', async t => {
  const fixture = storageFixture(t)
  await settings.saveSetting('navigationLayout', 'classic')
  assert.deepEqual(fixture.writes, [{ navigationLayout: 'classic' }])
  assert.deepEqual(fixture.localWrites, [])
})

test('remote quotes are opt-in and invalid stored values remain disabled', async t => {
  storageFixture(t, { enableRemoteQuotes: 'true' })
  assert.equal(settings.DEFAULT_SETTINGS.enableRemoteQuotes, false)
  assert.equal((await settings.loadSettings()).enableRemoteQuotes, false)
})

test('API endpoints allow loopback HTTP or HTTPS without embedded credentials', () => {
  for (const url of ['http://localhost:37373', 'http://127.0.0.1:8080', 'http://[::1]:37373', 'https://example.com/inbox']) {
    assert.equal(settings.normalizeApiUrl(url), url)
  }
  for (const url of ['http://example.com', 'http://1.2.3.4:8080', 'https://user:pass@example.com', 'https://example.com/?token=secret', 'https://example.com/#secret', 'https://*', 'https://%2A', 'https://*.example.com']) {
    assert.equal(settings.normalizeApiUrl(url), settings.DEFAULT_JUSTDOIT_API_URL)
  }
})
