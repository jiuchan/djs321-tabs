import Dexie, { Table } from 'dexie'
import { ArchivedTab, UndoItem, QuickLink } from '../types'

class TabButlerDB extends Dexie {
  archived!: Table<ArchivedTab>
  undo!: Table<UndoItem>
  quickLinks!: Table<QuickLink>

  constructor() {
    super('TabButlerDB')
    // v1 版本
    this.version(1).stores({
      archived: '++id, url, archivedAt, group',
      undo: '++id, closedAt',
    })
    // v2 版本: 新增 quickLinks
    this.version(2).stores({
      quickLinks: '++id, url, order',
    })
    // v3 版本: 为 quickLinks 新增 category 索引
    this.version(3).stores({
      quickLinks: '++id, url, order, category',
    })
  }
}

export const db = new TabButlerDB()
