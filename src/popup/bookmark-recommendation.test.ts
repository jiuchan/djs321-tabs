import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bookmarkRecommendationLabel, collectBookmarkMatches, recommendBookmarkFolder } from './bookmark-recommendation.ts'

const folders = [
  { id: '1', title: '收藏夹栏', path: '收藏夹栏', depth: 0 },
  { id: 'ai', title: 'AI 工具', path: '收藏夹栏 / 工作 / AI 工具', depth: 2 },
  { id: 'music', title: '音乐', path: '收藏夹栏 / 个人与思维 / 音乐', depth: 2 },
]

const input = {
  url: 'https://skillhub.cn/', title: 'SkillHub - AI Skills 社区', folders,
  bookmarks: [], preferences: {}, recentFolderId: 'music', category: 'ai' as const,
}

test('SkillHub content chooses the existing AI folder instead of the last music folder', () => {
  assert.deepEqual(recommendBookmarkFolder(input), { folderId: 'ai', source: 'content' })
})

test('an explicit valid site rule wins over inferred content', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, preferences: { 'skillhub.cn': 'music' } }),
    { folderId: 'music', source: 'host' })
})

test('a deleted site rule is ignored without modifying preferences', () => {
  const preferences = { 'skillhub.cn': 'deleted' }
  assert.deepEqual(recommendBookmarkFolder({ ...input, preferences }), { folderId: 'ai', source: 'content' })
  assert.deepEqual(preferences, { 'skillhub.cn': 'deleted' })
})

test('an exact existing bookmark takes priority over content and unrelated recent folders', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, bookmarks: [
    { id: 'existing', title: 'SkillHub', url: 'https://skillhub.cn/#top', parentId: 'music' },
  ] }), { folderId: 'music', source: 'existing' })
})

test('a unique same-host collection is reused, not a substring lookalike host', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, category: 'default' as const, bookmarks: [
    { id: 'a', title: 'Skill', url: 'https://skillhub.cn/skills', parentId: 'ai' },
    { id: 'b', title: 'Other', url: 'https://skillhub.cn.example.com/', parentId: 'music' },
  ] }), { folderId: 'ai', source: 'same-site' })
})

test('conflicting same-site folders do not become a confident recommendation', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, category: 'default' as const, bookmarks: [
    { id: 'a', title: 'Skill', url: 'https://skillhub.cn/a', parentId: 'ai' },
    { id: 'b', title: 'Skill', url: 'https://skillhub.cn/b', parentId: 'music' },
  ] }), { folderId: 'music', source: 'recent' })
})

test('category matches leaf names, never unrelated descendants of an AI parent', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, folders: [
    { id: 'music', title: '音乐', path: '收藏夹栏 / AI / 音乐', depth: 2 },
  ] }), { folderId: 'music', source: 'recent' })
})

test('ambiguous AI folders fall back honestly rather than selecting the first one', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, folders: [
    ...folders, { id: 'other-ai', title: '人工智能', path: '其他收藏夹 / 人工智能', depth: 1 },
  ] }), { folderId: 'music', source: 'recent' })
})

test('unknown pages use an explicitly identified recent fallback, never an AI guess', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, url: 'https://example.com/', title: 'Daily', category: 'default' as const }),
    { folderId: 'music', source: 'recent' })
})

test('missing or deleted fallback asks for a folder instead of silently choosing the first', () => {
  assert.deepEqual(recommendBookmarkFolder({ ...input, category: 'default' as const, recentFolderId: 'deleted' }),
    { folderId: null, source: 'none' })
})

test('recent fallback and content matches are labelled as different decision sources', () => {
  assert.equal(bookmarkRecommendationLabel.recent, 'Recently used')
  assert.equal(bookmarkRecommendationLabel.content, 'Content match')
  assert.equal(bookmarkRecommendationLabel.none, 'Not chosen')
})

test('collectBookmarkMatches retains real parent IDs without turning folders into bookmarks', () => {
  assert.deepEqual(collectBookmarkMatches([
    { id: '1', title: '收藏夹栏', children: [
      { id: 'ai', title: 'AI 工具', parentId: '1', children: [
        { id: 'site', title: 'SkillHub', url: 'https://skillhub.cn/', parentId: 'ai' },
      ] },
    ] },
  ]), [{ id: 'site', title: 'SkillHub', url: 'https://skillhub.cn/', parentId: 'ai' }])
})

test('popup uses one recommendation for its displayed path and picker selection', () => {
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
  assert.match(source, /recommendBookmarkFolder\(/)
  assert.match(source, /setSelectedFolderId\(recommendation.folderId \|\| ''\)/)
  assert.match(source, /bookmarkRecommendationLabel/)
  assert.doesNotMatch(source, /currentBookmark \? '规则命中' : '推荐'/)
  assert.doesNotMatch(source, /setSelectedFolderId\(prev => prev \|\| preferredFolderId \|\| folders\[0\]/)
})
