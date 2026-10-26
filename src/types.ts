export interface ArchivedTab {
  id?: number
  title: string
  url: string
  favicon?: string
  archivedAt: Date
  note?: string
  group?: string
}

export interface UndoItem {
  id?: number
  title: string
  url: string
  closedAt: Date
}

export interface QuickLink {
  id?: number
  url: string
  title: string
  iconUrl?: string
  order: number
  category?: string
  prompt?: string
}
