import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBookmarkRuleSummaries,
  buildQuickLinkCategoryOptions,
  buildQuickLinkRuleSummaries,
  clearFolderPreferenceForUrl,
  clearQuickLinkCategoryPreferenceForUrl,
  createRuleSnapshot,
  findMatchingQuickLink,
  findPreferredBookmark,
  flattenBookmarkFolders,
  parseRuleSnapshot,
  partitionTabsForQuickLinks,
  partitionTabsForBookmarks,
  prioritizeRecentFolder,
  pushRecentAction,
  rememberQuickLinkCategoryPreferenceForUrl,
  resolvePreferredQuickLinkCategoryForUrl,
  rememberFolderPreferenceForUrl,
  resolvePreferredFolderIdForUrl,
  resolveBookmarkFolderPath,
  uniqueTabsByUrl,
  urlsMatch,
} from './helpers.ts'

test('flattenBookmarkFolders returns nested folders with readable paths', () => {
  const tree = [
    {
      id: '1',
      title: '书签栏',
      children: [
        {
          id: '10',
          title: '工作',
          children: [
            { id: '11', title: 'AI', children: [] },
          ],
        },
        { id: '12', title: '读书', children: [] },
      ],
    },
  ] as chrome.bookmarks.BookmarkTreeNode[]

  const folders = flattenBookmarkFolders(tree)

  assert.deepEqual(
    folders.map(folder => ({ id: folder.id, path: folder.path })),
    [
      { id: '1', path: '书签栏' },
      { id: '10', path: '书签栏 / 工作' },
      { id: '11', path: '书签栏 / 工作 / AI' },
      { id: '12', path: '书签栏 / 读书' },
    ],
  )
})

test('prioritizeRecentFolder moves recent folder to the front without losing others', () => {
  const folders = [
    { id: '1', title: '书签栏', path: '书签栏', depth: 0 },
    { id: '10', title: '工作', path: '书签栏 / 工作', depth: 1 },
    { id: '12', title: '读书', path: '书签栏 / 读书', depth: 1 },
  ]

  const prioritized = prioritizeRecentFolder(folders, '12')

  assert.equal(prioritized[0]?.id, '12')
  assert.deepEqual(
    prioritized.map(folder => folder.id),
    ['12', '1', '10'],
  )
})

test('urlsMatch ignores hash and trailing slash differences', () => {
  assert.equal(urlsMatch('https://example.com/docs/', 'https://example.com/docs#intro'), true)
  assert.equal(urlsMatch('https://example.com/docs?a=1', 'https://example.com/docs/?a=1'), true)
  assert.equal(urlsMatch('https://example.com/docs?a=1', 'https://example.com/docs?a=2'), false)
})

test('findMatchingQuickLink finds existing items with normalized urls', () => {
  const match = findMatchingQuickLink(
    [
      { id: 1, url: 'https://example.com/docs/', title: 'Docs', order: 0 },
      { id: 2, url: 'https://openai.com', title: 'OpenAI', order: 1 },
    ],
    'https://example.com/docs#section-2',
  )

  assert.equal(match?.id, 1)
})

test('resolveBookmarkFolderPath returns folder path for parent folder id', () => {
  const path = resolveBookmarkFolderPath(
    [
      { id: '1', title: '书签栏', path: '书签栏', depth: 0 },
      { id: '11', title: 'AI', path: '书签栏 / 工作 / AI', depth: 2 },
    ],
    '11',
  )

  assert.equal(path, '书签栏 / 工作 / AI')
  assert.equal(resolveBookmarkFolderPath([], '404'), '')
})

test('findPreferredBookmark prefers the recent folder when duplicates exist', () => {
  const match = findPreferredBookmark(
    [
      { id: 'a', title: 'Doc A', url: 'https://example.com/doc', parentId: '11' },
      { id: 'b', title: 'Doc B', url: 'https://example.com/doc#top', parentId: '22' },
    ],
    'https://example.com/doc/',
    '22',
  )

  assert.equal(match?.id, 'b')
})

test('pushRecentAction prepends newest entry and deduplicates by action and normalized url', () => {
  const recent = pushRecentAction(
    [
      { type: 'bookmark', title: '旧标题', url: 'https://example.com/doc', detail: '书签栏 / AI', at: '2026-05-21T10:00:00.000Z' },
      { type: 'inbox', title: '别的页面', url: 'https://openai.com', detail: '', at: '2026-05-21T09:59:00.000Z' },
    ],
    { type: 'bookmark', title: '新标题', url: 'https://example.com/doc#section', detail: '书签栏 / 工作', at: '2026-05-21T10:05:00.000Z' },
    5,
  )

  assert.deepEqual(recent.map(item => [item.type, item.title]), [
    ['bookmark', '新标题'],
    ['inbox', '别的页面'],
  ])
  assert.equal(recent[0]?.detail, '书签栏 / 工作')
})

test('uniqueTabsByUrl keeps first occurrence for normalized duplicate urls', () => {
  const tabs = uniqueTabsByUrl([
    { id: 1, title: 'A', url: 'https://example.com/docs/' },
    { id: 2, title: 'B', url: 'https://example.com/docs#intro' },
    { id: 3, title: 'C', url: 'https://openai.com' },
  ])

  assert.deepEqual(tabs.map(tab => tab.id), [1, 3])
})

test('partitionTabsForQuickLinks filters out urls already in navigation', () => {
  const result = partitionTabsForQuickLinks(
    [
      { id: 1, title: 'Docs', url: 'https://example.com/docs/' },
      { id: 2, title: 'OpenAI', url: 'https://openai.com' },
      { id: 3, title: 'Docs Duplicate', url: 'https://example.com/docs#top' },
    ],
    [
      { id: 9, title: 'OpenAI', url: 'https://openai.com/', order: 0 },
    ],
  )

  assert.deepEqual(result.creatableTabs.map(tab => tab.id), [1])
  assert.equal(result.existingCount, 1)
  assert.equal(result.duplicateCount, 1)
})

test('resolvePreferredQuickLinkCategoryForUrl prefers host-specific category over inferred fallback', () => {
  const prefs = {
    'docs.example.com': '📄 文档协作',
  }

  assert.equal(
    resolvePreferredQuickLinkCategoryForUrl('https://docs.example.com/a', prefs, '💻 开发工具'),
    '📄 文档协作',
  )
  assert.equal(
    resolvePreferredQuickLinkCategoryForUrl('https://other.example.com/a', prefs, '💻 开发工具'),
    '💻 开发工具',
  )
})

test('resolvePreferredFolderIdForUrl prefers host-specific folder over recent folder', () => {
  const prefs = {
    'docs.example.com': 'folder-host',
  }

  assert.equal(resolvePreferredFolderIdForUrl('https://docs.example.com/a', prefs, 'folder-recent'), 'folder-host')
  assert.equal(resolvePreferredFolderIdForUrl('https://other.example.com/a', prefs, 'folder-recent'), 'folder-recent')
  assert.equal(resolvePreferredFolderIdForUrl('notaurl', prefs, 'folder-recent'), 'folder-recent')
})

test('rememberFolderPreferenceForUrl stores folder by hostname', () => {
  const prefs = rememberFolderPreferenceForUrl({}, 'https://docs.example.com/path', 'folder-1')
  assert.deepEqual(prefs, { 'docs.example.com': 'folder-1' })
  assert.deepEqual(rememberFolderPreferenceForUrl(prefs, 'notaurl', 'folder-2'), prefs)
})

test('clearFolderPreferenceForUrl removes stored hostname mapping', () => {
  const prefs = clearFolderPreferenceForUrl(
    {
      'docs.example.com': 'folder-1',
      'other.example.com': 'folder-2',
    },
    'https://docs.example.com/path',
  )

  assert.deepEqual(prefs, { 'other.example.com': 'folder-2' })
  assert.deepEqual(clearFolderPreferenceForUrl(prefs, 'notaurl'), prefs)
})

test('rememberQuickLinkCategoryPreferenceForUrl stores category by hostname', () => {
  const prefs = rememberQuickLinkCategoryPreferenceForUrl({}, 'https://docs.example.com/path', '📄 文档协作')
  assert.deepEqual(prefs, { 'docs.example.com': '📄 文档协作' })
})

test('clearQuickLinkCategoryPreferenceForUrl removes stored category mapping', () => {
  const prefs = clearQuickLinkCategoryPreferenceForUrl(
    {
      'docs.example.com': '📄 文档协作',
      'other.example.com': '💻 开发工具',
    },
    'https://docs.example.com/path',
  )

  assert.deepEqual(prefs, { 'other.example.com': '💻 开发工具' })
})

test('buildBookmarkRuleSummaries sorts rules and skips missing folders', () => {
  const summaries = buildBookmarkRuleSummaries(
    {
      'b.example.com': 'folder-b',
      'a.example.com': 'folder-a',
      'missing.example.com': 'folder-missing',
    },
    [
      { id: 'folder-a', title: 'AI', path: '书签栏 / AI', depth: 1 },
      { id: 'folder-b', title: '阅读', path: '书签栏 / 阅读', depth: 1 },
    ],
  )

  assert.deepEqual(
    summaries.map(item => [item.hostname, item.folderId, item.folderPath]),
    [
      ['a.example.com', 'folder-a', '书签栏 / AI'],
      ['b.example.com', 'folder-b', '书签栏 / 阅读'],
    ],
  )
})

test('buildQuickLinkRuleSummaries sorts category rules by hostname', () => {
  const summaries = buildQuickLinkRuleSummaries({
    'b.example.com': 'B 类',
    'a.example.com': 'A 类',
  })

  assert.deepEqual(
    summaries.map(item => [item.hostname, item.category]),
    [
      ['a.example.com', 'A 类'],
      ['b.example.com', 'B 类'],
    ],
  )
})

test('buildQuickLinkCategoryOptions prioritizes suggested category and deduplicates known categories', () => {
  const options = buildQuickLinkCategoryOptions(
    '📄 文档协作',
    [
      { id: 1, title: 'Docs', url: 'https://docs.example.com', order: 0, category: '📄 文档协作' },
      { id: 2, title: 'AI', url: 'https://ai.example.com', order: 1, category: '🤖 AI 工具' },
      { id: 3, title: 'Empty', url: 'https://empty.example.com', order: 2, category: ' ' },
    ],
    {
      'docs.example.com': '📄 文档协作',
      'dev.example.com': '💻 开发工具',
    },
  )

  assert.deepEqual(options, ['📄 文档协作', '🤖 AI 工具', '💻 开发工具', 'Default'])
})

test('createRuleSnapshot packages both rule maps with version metadata', () => {
  const snapshot = createRuleSnapshot(
    { 'docs.example.com': 'folder-docs' },
    { 'docs.example.com': '📄 文档协作' },
    '2026-05-21T12:00:00.000Z',
  )

  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.exportedAt, '2026-05-21T12:00:00.000Z')
  assert.deepEqual(snapshot.bookmarkFolderPrefs, { 'docs.example.com': 'folder-docs' })
  assert.deepEqual(snapshot.quickLinkCategoryPrefs, { 'docs.example.com': '📄 文档协作' })
})

test('parseRuleSnapshot accepts valid snapshot json and sanitizes invalid entries', () => {
  const parsed = parseRuleSnapshot(JSON.stringify({
    version: 1,
    exportedAt: '2026-05-21T12:00:00.000Z',
    bookmarkFolderPrefs: {
      'docs.example.com': 'folder-docs',
      'bad.example.com': 123,
    },
    quickLinkCategoryPrefs: {
      'docs.example.com': '📄 文档协作',
      'bad.example.com': null,
    },
  }))

  assert.deepEqual(parsed.bookmarkFolderPrefs, { 'docs.example.com': 'folder-docs' })
  assert.deepEqual(parsed.quickLinkCategoryPrefs, { 'docs.example.com': '📄 文档协作' })
})

test('parseRuleSnapshot rejects malformed payloads', () => {
  assert.throws(() => parseRuleSnapshot('not-json'))
  assert.throws(() => parseRuleSnapshot(JSON.stringify({ version: 2 })))
  assert.throws(() => parseRuleSnapshot(JSON.stringify({ version: 1, bookmarkFolderPrefs: [], quickLinkCategoryPrefs: {} })))
})

test('partitionTabsForBookmarks groups tabs by preferred folder and tracks skipped items', () => {
  const result = partitionTabsForBookmarks(
    [
      { id: 1, title: 'Docs', url: 'https://docs.example.com/a' },
      { id: 2, title: 'Other', url: 'https://other.example.com/b' },
      { id: 3, title: 'Dup', url: 'https://docs.example.com/a#top' },
      { id: 4, title: 'No Pref', url: 'https://unknown.example.com/c' },
    ],
    { 'docs.example.com': 'folder-docs' },
    'folder-recent',
  )

  assert.deepEqual(
    result.groups.map(group => [group.folderId, group.tabs.map(tab => tab.id)]),
    [
      ['folder-docs', [1]],
      ['folder-recent', [2, 4]],
    ],
  )
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.skippedCount, 0)
})
