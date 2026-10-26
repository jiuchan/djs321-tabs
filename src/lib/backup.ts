import type { ArchivedTab, QuickLink, UndoItem } from '../types.ts'
import type { Settings } from './settings.ts'
import { normalizeApiUrl, normalizeNavigationLayout } from './settings.ts'

export interface BackupSnapshot {
  data: { quickLinks?: QuickLink[]; archived?: ArchivedTab[]; undo?: UndoItem[] }
  settings: Partial<Settings>
}

interface BackupTable<T> {
  clear(): Promise<unknown>
  bulkAdd(records: T[]): Promise<unknown>
}

export interface BackupDependencies {
  // The adapter must cover all three tables and roll back on a rejected write.
  transaction(work: () => Promise<void>): Promise<void>
  quickLinks: BackupTable<QuickLink>
  archived: BackupTable<ArchivedTab>
  undo: BackupTable<UndoItem>
}

function invalid(field: string): never {
  throw new Error(`Invalid backup: ${field}`)
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value as Record<string, unknown>
}

function owns(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  return owns(value, key) ? value[key] : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function date(value: unknown, field: string): Date {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') invalid(field)
  const result = new Date(value)
  if (!Number.isFinite(result.getTime())) invalid(field)
  return result
}

function isPageUrl(value: string, allowFile: boolean): boolean {
  if (!/^(https?|file):\/\//i.test(value)) return false
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return false
  }
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      ? parsed.hostname !== ''
      : allowFile && parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function isImageUrl(value: string, allowFile = false): boolean {
  return isPageUrl(value, allowFile)
    || /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)
}

function optionalImage(value: unknown, field: string, allowFile = false): string | undefined {
  const result = optionalString(value)
  if (result !== undefined && !isImageUrl(result, allowFile)) invalid(field)
  return result
}

function commonRecord(row: Record<string, unknown>, field: string, allowFile: boolean) {
  const title = ownValue(row, 'title')
  const url = ownValue(row, 'url')
  if (typeof title !== 'string') invalid(`${field}.title`)
  if (typeof url !== 'string' || !isPageUrl(url.trim(), allowFile)) invalid(`${field}.url`)
  const result: { title: string; url: string; id?: number } = { title: title.trim(), url: url.trim() }
  if (owns(row, 'id')) {
    const id = row.id
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) invalid(`${field}.id`)
    result.id = id
  }
  return result
}

function optionalFields<K extends string>(row: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {}
  for (const key of keys) {
    const value = optionalString(ownValue(row, key))
    if (value !== undefined) result[key] = value
  }
  return result
}

function quickLink(value: unknown, field: string): QuickLink {
  const row = object(value, field)
  const order = ownValue(row, 'order')
  if (typeof order !== 'number' || !Number.isFinite(order)) invalid(`${field}.order`)
  const result: QuickLink = {
    ...commonRecord(row, field, false), order,
    ...optionalFields(row, ['category', 'prompt']),
  }
  const iconUrl = optionalImage(ownValue(row, 'iconUrl'), `${field}.iconUrl`)
  if (iconUrl !== undefined) result.iconUrl = iconUrl
  return result
}

function archivedTab(value: unknown, field: string): ArchivedTab {
  const row = object(value, field)
  const result: ArchivedTab = {
    ...commonRecord(row, field, true),
    archivedAt: date(ownValue(row, 'archivedAt'), `${field}.archivedAt`),
    ...optionalFields(row, ['note', 'group']),
  }
  const favicon = optionalImage(ownValue(row, 'favicon'), `${field}.favicon`, true)
  if (favicon !== undefined) result.favicon = favicon
  return result
}

function undoItem(value: unknown, field: string): UndoItem {
  const row = object(value, field)
  return {
    ...commonRecord(row, field, true),
    closedAt: date(ownValue(row, 'closedAt'), `${field}.closedAt`),
  }
}

function collection<T extends { id?: number }>(source: Record<string, unknown>, key: string, parse: (value: unknown, field: string) => T): T[] | undefined {
  if (!owns(source, key)) return undefined
  const value = source[key]
  if (!Array.isArray(value)) invalid(`data.${key}`)
  const ids = new Set<number>()
  return value.map((item: unknown, index: number) => {
    const record = parse(item, `data.${key}[${index}]`)
    if (record.id !== undefined) {
      if (ids.has(record.id)) invalid(`data.${key}: duplicate id ${record.id}`)
      ids.add(record.id)
    }
    return record
  })
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some(option => option === value)
}

function parseSettings(value: unknown): Partial<Settings> {
  const result: Partial<Settings> = { enableRemoteQuotes: false }
  if (value === undefined) return result
  const source = object(value, 'settings')
  const groupBy = ownValue(source, 'groupBy')
  if (isOneOf(groupBy, ['none', 'domain', 'chromeGroup', 'window', 'time', 'category'])) result.groupBy = groupBy
  const viewMode = ownValue(source, 'viewMode')
  if (isOneOf(viewMode, ['grid', 'list', 'kanban'])) result.viewMode = viewMode
  const theme = ownValue(source, 'theme')
  if (isOneOf(theme, ['light', 'dark'])) result.theme = theme
  const navigationLayout = ownValue(source, 'navigationLayout')
  if (typeof navigationLayout === 'string') result.navigationLayout = normalizeNavigationLayout(navigationLayout)
  const sections: readonly Settings['defaultSection'][] = ['tabs', 'quicklinks', 'bookmarks']
  const defaultSection = ownValue(source, 'defaultSection')
  if (isOneOf(defaultSection, sections)) result.defaultSection = defaultSection
  const navOrder = ownValue(source, 'navOrder')
  if (Array.isArray(navOrder)) {
    const entries: unknown[] = navOrder
    if (entries.length > 0 && entries.every((entry): entry is Settings['defaultSection'] => isOneOf(entry, sections))
      && new Set(entries).size === entries.length) result.navOrder = [...entries]
  }
  const wallpaper = ownValue(source, 'wallpaper')
  if (typeof wallpaper === 'string' && (wallpaper.trim() === '' || isImageUrl(wallpaper.trim()))) result.wallpaper = wallpaper.trim()
  const wallpaperBlur = ownValue(source, 'wallpaperBlur')
  if (typeof wallpaperBlur === 'number' && Number.isFinite(wallpaperBlur) && wallpaperBlur >= 0 && wallpaperBlur <= 20) result.wallpaperBlur = wallpaperBlur
  const wallpaperDim = ownValue(source, 'wallpaperDim')
  if (typeof wallpaperDim === 'number' && Number.isFinite(wallpaperDim) && wallpaperDim >= 0 && wallpaperDim <= 0.8) result.wallpaperDim = wallpaperDim
  const justdoitApiUrl = ownValue(source, 'justdoitApiUrl')
  if (typeof justdoitApiUrl === 'string') result.justdoitApiUrl = normalizeApiUrl(justdoitApiUrl)
  result.enableRemoteQuotes = ownValue(source, 'enableRemoteQuotes') === true
  return result
}

export function parseBackup(text: string): BackupSnapshot {
  const parsed: unknown = JSON.parse(text)
  const source = object(parsed, 'root')
  if (ownValue(source, 'version') !== 1) invalid('version')
  const sourceData = object(ownValue(source, 'data'), 'data')
  if (owns(source, 'timestamp')) date(source.timestamp, 'timestamp')
  const data: BackupSnapshot['data'] = {}
  const quickLinks = collection(sourceData, 'quickLinks', quickLink)
  if (quickLinks !== undefined) data.quickLinks = quickLinks
  const archived = collection(sourceData, 'archived', archivedTab)
  if (archived !== undefined) data.archived = archived
  const undo = collection(sourceData, 'undo', undoItem)
  if (undo !== undefined) data.undo = undo
  return { data, settings: parseSettings(ownValue(source, 'settings')) }
}

async function replaceTable<T>(table: BackupTable<T>, records: T[] | undefined): Promise<void> {
  if (records === undefined) return
  await table.clear()
  if (records.length > 0) await table.bulkAdd(records)
}

export async function replaceBackupCollections(snapshot: BackupSnapshot, deps: BackupDependencies): Promise<void> {
  const { quickLinks, archived, undo } = snapshot.data
  if (quickLinks === undefined && archived === undefined && undo === undefined) return
  await deps.transaction(async () => {
    await replaceTable(deps.quickLinks, quickLinks)
    await replaceTable(deps.archived, archived)
    await replaceTable(deps.undo, undo)
  })
}
