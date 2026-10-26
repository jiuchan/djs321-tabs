import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBackup, replaceBackupCollections } from './backup.ts'
import { DEFAULT_JUSTDOIT_API_URL } from './settings.ts'
import type { ArchivedTab, QuickLink, UndoItem } from '../types.ts'

const timestamp = '2026-10-10T09:30:00.000Z'
const quickLink = { id: 1, title: 'Example', url: 'https://example.com/path?q=1#part', order: 0 }
const archivedTab = { id: 1, title: 'Archived', url: 'http://example.com/', archivedAt: timestamp }
const undoItem = { id: 1, title: 'Closed', url: 'https://example.com/', closedAt: timestamp }
const tables = ['quickLinks', 'archived', 'undo'] as const
const records = { quickLinks: quickLink, archived: archivedTab, undo: undoItem }

function backup(data: unknown = {}, settings: unknown = {}) {
  return JSON.stringify({ version: 1, timestamp, settings, data })
}

test('parses the version 1 export and restores Date instances', () => {
  const snapshot = parseBackup(backup({ quickLinks: [quickLink], archived: [archivedTab], undo: [undoItem] }))
  assert.deepEqual(snapshot.data.quickLinks, [quickLink])
  assert.deepEqual(snapshot.data.archived, [{ ...archivedTab, archivedAt: new Date(timestamp) }])
  assert.deepEqual(snapshot.data.undo, [{ ...undoItem, closedAt: new Date(timestamp) }])
  assert.ok(snapshot.data.archived?.[0].archivedAt instanceof Date)
  assert.ok(snapshot.data.undo?.[0].closedAt instanceof Date)
})

test('rejects invalid JSON and non-object envelopes', () => {
  for (const text of ['', '{', 'null', '[]', 'true', '1', '"backup"']) {
    assert.throws(() => parseBackup(text), Error, text)
  }
})

test('requires version 1 and a data object', () => {
  for (const value of [{}, { version: 1 }, { version: 1, data: null }, { version: 1, data: [] }, { version: 1, data: 'bad' }]) {
    assert.throws(() => parseBackup(JSON.stringify(value)))
  }
  for (const version of [undefined, null, 0, 2, '1', true]) {
    assert.throws(() => parseBackup(JSON.stringify({ version, data: {} })))
  }
})

test('validates supplied timestamps without requiring optional export metadata', () => {
  assert.deepEqual(parseBackup(JSON.stringify({ version: 1, data: {} })).data, {})
  for (const value of [null, '', 'not a date', true, {}, []]) {
    assert.throws(() => parseBackup(JSON.stringify({ version: 1, timestamp: value, data: {} })))
  }
})

test('rejects malformed arrays rather than treating them as absent tables', () => {
  for (const table of tables) {
    for (const value of [null, {}, 'bad', 0, true, [null], [[]], [1], ['bad']]) {
      assert.throws(() => parseBackup(backup({ [table]: value })), Error, table)
    }
  }
})

test('requires string titles and absolute supported URLs on every record', () => {
  for (const table of tables) {
    for (const field of ['title', 'url']) {
      for (const value of [undefined, null, 1, true, {}, []]) {
        assert.throws(() => parseBackup(backup({ [table]: [{ ...records[table], [field]: value }] })))
      }
    }
  }
})

test('keeps legitimate empty tab titles instead of inventing a title', () => {
  for (const table of tables) {
    assert.equal(parseBackup(backup({ [table]: [{ ...records[table], title: '' }] })).data[table]?.[0].title, '')
  }
})

test('rejects missing, non-numeric, or non-finite quick-link order', () => {
  for (const order of [undefined, null, '0', true, {}, NaN, Infinity, -Infinity]) {
    assert.throws(() => parseBackup(backup({ quickLinks: [{ ...quickLink, order }] })))
  }
  assert.throws(() => parseBackup(backup({ quickLinks: [quickLink] }).replace('"order":0', '"order":1e400')))
  assert.equal(parseBackup(backup({ quickLinks: [{ ...quickLink, order: -0.5 }] })).data.quickLinks?.[0].order, -0.5)
})

test('normalizes valid date strings and numeric timestamps but rejects invalid dates', () => {
  for (const [table, field] of [['archived', 'archivedAt'], ['undo', 'closedAt']] as const) {
    for (const value of [undefined, null, '', 'not a date', true, {}, [], 9e15]) {
      assert.throws(() => parseBackup(backup({ [table]: [{ ...records[table], [field]: value }] })))
    }
    for (const value of ['2026-10-10T11:30:00+02:00', Date.parse(timestamp), 0]) {
      const row = parseBackup(backup({ [table]: [{ ...records[table], [field]: value }] })).data[table]?.[0]
      assert.ok(row)
      const date = table === 'archived' ? (row as ArchivedTab).archivedAt : (row as UndoItem).closedAt
      assert.equal(date.getTime(), new Date(value).getTime())
    }
  }
})

test('accepts absent IDs and positive integer IDs only', () => {
  for (const table of tables) {
    const { id: _id, ...withoutId } = records[table]
    const row = parseBackup(backup({ [table]: [withoutId] })).data[table]?.[0]
    assert.ok(row)
    assert.equal(Object.hasOwn(row, 'id'), false)
    for (const id of [null, 0, -1, '1', true, {}, NaN, Infinity]) {
      assert.throws(() => parseBackup(backup({ [table]: [{ ...records[table], id }] })))
    }
    assert.throws(() => parseBackup(backup({ [table]: [records[table]] }).replace('"id":1', '"id":1e400')))
    for (const id of [1, 42, Number.MAX_SAFE_INTEGER]) {
      assert.equal(parseBackup(backup({ [table]: [{ ...records[table], id }] })).data[table]?.[0].id, id)
    }
  }
})

for (const table of tables) {
  test(`rejects decimal IDs in ${table}`, () => {
    for (const id of [0.5, 1.5, 10.25, Number.MIN_VALUE]) {
      assert.throws(() => parseBackup(backup({ [table]: [{ ...records[table], id }] })), /Invalid backup: data\..*\.id/)
    }
  })
}

test('rejects duplicate IDs within each table, even when other records are valid', () => {
  for (const table of tables) {
    assert.throws(() => parseBackup(backup({ [table]: [records[table], { ...records[table], title: 'Duplicate' }] })))
  }
})

test('allows equal IDs across different tables and multiple auto-generated IDs', () => {
  const { id: _id, ...withoutId } = quickLink
  const snapshot = parseBackup(backup({ quickLinks: [quickLink, withoutId, withoutId], archived: [archivedTab], undo: [undoItem] }))
  assert.equal(snapshot.data.quickLinks?.length, 3)
  assert.equal(snapshot.data.archived?.[0].id, 1)
  assert.equal(snapshot.data.undo?.[0].id, 1)
})

test('rejects executable, browser-internal, relative, and malformed page URLs', () => {
  const urls = [
    '', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'chrome://settings', 'edge://settings', 'about:blank', 'chrome-extension://id/page.html',
    'blob:https://example.com/id', 'ftp://example.com/file', '//example.com', '/relative',
    'example.com', 'https://', 'https://[bad]', 'https://example.com:99999', 'https:example.com',
    'https://exam\nple.com', 'https://example.com/\u0000',
  ]
  for (const table of tables) {
    for (const url of urls) {
      assert.throws(() => parseBackup(backup({ [table]: [{ ...records[table], url }] })), Error, `${table}: ${url}`)
    }
  }
})

test('preserves HTTP/HTTPS pages and permits file pages only for archive and undo', () => {
  for (const table of tables) {
    for (const url of ['http://localhost:37373/path', 'https://example.com/path?q=1#part', 'HTTPS://example.com/']) {
      assert.equal(parseBackup(backup({ [table]: [{ ...records[table], url }] })).data[table]?.[0].url, url)
    }
  }
  const url = 'file:///Users/example/notes%20one.html'
  for (const table of ['archived', 'undo'] as const) {
    assert.equal(parseBackup(backup({ [table]: [{ ...records[table], url }] })).data[table]?.[0].url, url)
  }
  assert.throws(() => parseBackup(backup({ quickLinks: [{ ...quickLink, url }] })))
})

test('normalizes optional strings and selects record fields without copying extra keys', () => {
  const snapshot = parseBackup(backup({
    quickLinks: [{ ...quickLink, title: ' Example ', url: ' https://example.com/ ', iconUrl: ' https://example.com/icon.png ', category: ' Work ', prompt: ' Explain ', extra: true }],
    archived: [{ ...archivedTab, favicon: null, note: ' Note ', group: ' ', extra: true }],
    undo: [{ ...undoItem, extra: true }],
  }))
  assert.deepEqual(snapshot.data.quickLinks, [{ ...quickLink, title: 'Example', url: 'https://example.com/', iconUrl: 'https://example.com/icon.png', category: 'Work', prompt: 'Explain' }])
  assert.deepEqual(snapshot.data.archived, [{ ...archivedTab, archivedAt: new Date(timestamp), note: 'Note' }])
  assert.deepEqual(snapshot.data.undo, [{ ...undoItem, closedAt: new Date(timestamp) }])
  assert.deepEqual(parseBackup(backup({ quickLinks: [{ ...quickLink, category: {}, prompt: null, iconUrl: 1 }] })).data.quickLinks, [quickLink])
})

test('rejects unsafe optional image URLs while preserving raster data images', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'data:image/svg+xml,<svg/>', 'chrome://settings']) {
    assert.throws(() => parseBackup(backup({ quickLinks: [{ ...quickLink, iconUrl: url }] })))
    assert.throws(() => parseBackup(backup({ archived: [{ ...archivedTab, favicon: url }] })))
  }
  const iconUrl = 'data:image/png;base64,eA=='
  assert.equal(parseBackup(backup({ quickLinks: [{ ...quickLink, iconUrl }] })).data.quickLinks?.[0].iconUrl, iconUrl)
})

test('preserves absent collections and distinguishes them from explicit empty arrays', () => {
  const snapshot = parseBackup(backup({ archived: [], extra: [] }))
  assert.deepEqual(snapshot.data, { archived: [] })
  assert.equal(Object.hasOwn(snapshot.data, 'quickLinks'), false)
  assert.equal(Object.hasOwn(snapshot.data, 'undo'), false)
})

test('keeps validated known settings and applies the existing layout/API normalizers', () => {
  const settings = {
    groupBy: 'category', viewMode: 'kanban', theme: 'dark', navigationLayout: 'sidebar',
    defaultSection: 'bookmarks', navOrder: ['bookmarks', 'tabs', 'quicklinks'],
    wallpaper: ' https://example.com/image.jpg ', wallpaperBlur: 20, wallpaperDim: 0.8,
    justdoitApiUrl: ' https://localhost:37373/// ', enableRemoteQuotes: true,
  }
  assert.deepEqual(parseBackup(backup({}, settings)).settings, {
    ...settings, wallpaper: 'https://example.com/image.jpg', justdoitApiUrl: 'https://localhost:37373',
  })
  assert.deepEqual(parseBackup(backup({}, { navigationLayout: 'old-layout', justdoitApiUrl: 'javascript:alert(1)' })).settings, {
    navigationLayout: 'top', justdoitApiUrl: DEFAULT_JUSTDOIT_API_URL, enableRemoteQuotes: false,
  })
})

test('classic preference survives backup parsing without changing collections', () => {
  const parsed = parseBackup(backup({ archived: [archivedTab] }, { navigationLayout: 'classic' }))
  assert.equal(parsed.settings.navigationLayout, 'classic')
  assert.equal(parsed.data.archived?.length, 1)
  assert.equal(parsed.data.archived?.[0].url, archivedTab.url)
})

test('imported API settings preserve loopback HTTP and remote HTTPS endpoints', () => {
  for (const justdoitApiUrl of [
    'http://localhost:37373', 'http://127.0.0.1:37373', 'http://[::1]:37373', 'https://example.com/api',
  ]) {
    assert.equal(parseBackup(backup({}, { justdoitApiUrl })).settings.justdoitApiUrl, justdoitApiUrl)
  }
})

test('imported API settings reject non-loopback HTTP, credentials, queries, and fragments', () => {
  for (const justdoitApiUrl of [
    'http://example.com', 'http://192.168.1.2:37373', 'http://localhost.example.com:37373',
    'https://user:password@example.com', 'http://user:password@localhost:37373',
    'https://example.com/api?token=secret', 'http://localhost:37373?token=secret',
    'https://example.com/api#token', 'http://localhost:37373#token',
  ]) {
    assert.equal(parseBackup(backup({}, { justdoitApiUrl })).settings.justdoitApiUrl, DEFAULT_JUSTDOIT_API_URL)
  }
})

test('ignores invalid settings values and never copies unknown or prototype keys', () => {
  const settings = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{},"extra":true}') as Record<string, unknown>
  Object.assign(settings, {
    groupBy: 'bad', viewMode: 'bad', theme: 'auto', navigationLayout: {}, defaultSection: 'bad',
    navOrder: ['tabs', 'tabs'], wallpaper: 'javascript:alert(1)', wallpaperBlur: 21,
    wallpaperDim: -1, justdoitApiUrl: {}, enableRemoteQuotes: 'true',
  })
  const parsed = parseBackup(backup({}, settings)).settings
  assert.deepEqual(parsed, { enableRemoteQuotes: false })
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype)
  for (const key of ['__proto__', 'constructor', 'prototype', 'extra', 'polluted']) {
    assert.equal(Object.hasOwn(parsed, key), false)
  }
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false)
})

test('validates navigation entries and numeric appearance ranges without coercion', () => {
  for (const navOrder of [null, 'tabs', [], ['tabs', 'unknown'], ['tabs', 1], ['tabs', 'tabs']]) {
    assert.equal(Object.hasOwn(parseBackup(backup({}, { navOrder })).settings, 'navOrder'), false)
  }
  for (const wallpaperBlur of [-1, 20.1, '4', null, true, Infinity]) {
    assert.equal(Object.hasOwn(parseBackup(backup({}, { wallpaperBlur })).settings, 'wallpaperBlur'), false)
  }
  for (const wallpaperDim of [-0.1, 0.81, '0.3', null, true, Infinity]) {
    assert.equal(Object.hasOwn(parseBackup(backup({}, { wallpaperDim })).settings, 'wallpaperDim'), false)
  }
  assert.deepEqual(parseBackup(backup({}, { wallpaper: '', wallpaperBlur: 0, wallpaperDim: 0 })).settings, {
    wallpaper: '', wallpaperBlur: 0, wallpaperDim: 0, enableRemoteQuotes: false,
  })
})

test('preserves local raster wallpapers and defaults remote quotes to false unless explicitly true', () => {
  const wallpaper = 'data:image/webp;base64,eA=='
  assert.equal(parseBackup(backup({}, { wallpaper })).settings.wallpaper, wallpaper)
  for (const enableRemoteQuotes of [undefined, null, false, 'true', 1, {}, []]) {
    assert.deepEqual(parseBackup(backup({}, { enableRemoteQuotes })).settings, { enableRemoteQuotes: false })
  }
  assert.deepEqual(parseBackup(JSON.stringify({ version: 1, data: {} })).settings, { enableRemoteQuotes: false })
})

test('rejects malformed settings containers', () => {
  for (const settings of [null, [], 'bad', 1, true]) {
    assert.throws(() => parseBackup(backup({}, settings)))
  }
})

function transactionFixture(failureAt?: string) {
  const state = {
    quickLinks: [{ ...quickLink, id: 10, title: 'Old quick link' }],
    archived: [{ ...archivedTab, id: 10, title: 'Old archive', archivedAt: new Date(timestamp) }],
    undo: [{ ...undoItem, id: 10, title: 'Old undo', closedAt: new Date(timestamp) }],
  }
  const original = structuredClone(state)
  const calls: string[] = []
  let active = false
  function table<T>(name: keyof typeof state, rows: T[]) {
    return {
      async clear() {
        assert.equal(active, true, 'clear must run inside the transaction')
        calls.push(`${name}.clear`)
        rows.splice(0)
        if (failureAt === `${name}.clear`) throw new Error('write failed')
      },
      async bulkAdd(records: T[]) {
        assert.equal(active, true, 'bulkAdd must run inside the transaction')
        calls.push(`${name}.bulkAdd`)
        rows.push(...records)
        if (failureAt === `${name}.bulkAdd`) throw new Error('write failed')
      },
    }
  }
  const deps: Parameters<typeof replaceBackupCollections>[1] = {
    quickLinks: table<QuickLink>('quickLinks', state.quickLinks),
    archived: table<ArchivedTab>('archived', state.archived),
    undo: table<UndoItem>('undo', state.undo),
    async transaction(work) {
      assert.equal(active, false)
      calls.push('transaction.start')
      active = true
      try {
        await work()
        calls.push('transaction.commit')
      } catch (error) {
        state.quickLinks.splice(0, state.quickLinks.length, ...original.quickLinks)
        state.archived.splice(0, state.archived.length, ...original.archived)
        state.undo.splice(0, state.undo.length, ...original.undo)
        calls.push('transaction.rollback')
        throw error
      } finally {
        active = false
      }
    },
  }
  return { state, original, calls, deps }
}

test('replaces all supplied collections in one awaited transaction', async () => {
  const fixture = transactionFixture()
  const snapshot = parseBackup(backup({ quickLinks: [quickLink], archived: [archivedTab], undo: [undoItem] }))
  await replaceBackupCollections(snapshot, fixture.deps)
  assert.deepEqual(fixture.state, snapshot.data)
  assert.deepEqual(fixture.calls, [
    'transaction.start', 'quickLinks.clear', 'quickLinks.bulkAdd', 'archived.clear',
    'archived.bulkAdd', 'undo.clear', 'undo.bulkAdd', 'transaction.commit',
  ])
})

test('clears explicit empty arrays without touching absent collections', async () => {
  const fixture = transactionFixture()
  await replaceBackupCollections(parseBackup(backup({ archived: [] })), fixture.deps)
  assert.deepEqual(fixture.state, { ...fixture.original, archived: [] })
  assert.deepEqual(fixture.calls, ['transaction.start', 'archived.clear', 'transaction.commit'])
})

test('settings-only backups perform no collection writes', async () => {
  const fixture = transactionFixture()
  await replaceBackupCollections(parseBackup(backup({}, { theme: 'dark' })), fixture.deps)
  assert.deepEqual(fixture.state, fixture.original)
  assert.equal(fixture.calls.some(call => call.includes('.clear') || call.includes('.bulkAdd')), false)
})

for (const table of tables) {
  for (const operation of ['clear', 'bulkAdd']) {
    test(`rolls back every collection if ${table}.${operation} rejects`, async () => {
      const fixture = transactionFixture(`${table}.${operation}`)
      const snapshot = parseBackup(backup({ quickLinks: [quickLink], archived: [archivedTab], undo: [undoItem] }))
      await assert.rejects(replaceBackupCollections(snapshot, fixture.deps), /write failed/)
      assert.deepEqual(fixture.state, fixture.original)
      assert.equal(fixture.calls.at(-1), 'transaction.rollback')
      assert.equal(fixture.calls.filter(call => call === 'transaction.start').length, 1)
      assert.equal(fixture.calls.includes('transaction.commit'), false)
    })
  }
}

test('propagates a transaction-level rejection', async () => {
  const fixture = transactionFixture()
  fixture.deps.transaction = async () => { throw new Error('transaction unavailable') }
  await assert.rejects(replaceBackupCollections(parseBackup(backup({ quickLinks: [] })), fixture.deps), /transaction unavailable/)
  assert.deepEqual(fixture.state, fixture.original)
  assert.deepEqual(fixture.calls, [])
})
