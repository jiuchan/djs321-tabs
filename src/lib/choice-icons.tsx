import { AppWindow, Bookmark, Clock, Columns3, Compass, Globe, LayoutGrid, List, Moon, PanelsTopLeft, Rows3, Shapes, Sun, Tags, type LucideIcon } from 'lucide-react'
import type { GroupBy, NavSection, Theme, ViewMode } from './settings'

// 设置项共用的线性图标：设置页、新标签页设置弹窗与工具栏保持一致，不依赖系统 emoji 字体
export const GROUP_ICONS: Record<GroupBy, LucideIcon> = {
  none: Rows3,
  domain: Globe,
  chromeGroup: Tags,
  window: AppWindow,
  time: Clock,
  category: Shapes,
}

export const VIEW_ICONS: Record<ViewMode, LucideIcon> = {
  grid: LayoutGrid,
  list: List,
  kanban: Columns3,
}

export const THEME_ICONS: Record<Theme, LucideIcon> = {
  light: Sun,
  dark: Moon,
}

export const SECTION_ICONS: Record<NavSection, LucideIcon> = {
  tabs: PanelsTopLeft,
  quicklinks: Compass,
  bookmarks: Bookmark,
}
