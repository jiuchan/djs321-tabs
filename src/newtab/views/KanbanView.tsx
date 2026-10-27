import { TabGroup, hostname } from '../groupers'
import { getRenderableFaviconUrl } from '../../lib/favicon'
import { t } from '../../lib/i18n'

interface Props {
  groups: TabGroup[]
  onSwitch: (tab: chrome.tabs.Tab) => void
  onClose: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void
  onSend: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void
  selectedIds: Set<number>
  onAddToQuickLink?: (tab: chrome.tabs.Tab) => void
  onAddToBookmark?: (tab: chrome.tabs.Tab) => void
}

// 看板：每个分组是一列，横向滚动
export function KanbanView({ groups, onSwitch, onClose, onSend, selectedIds, onAddToQuickLink, onAddToBookmark }: Props) {
  return (
    <div className="kanban-root">
      {groups.map(group => (
        <div key={group.id} className="kanban-column">
          {/* 列标题 */}
          <div className="kanban-col-header">
            <span className="kanban-col-title">{group.label}</span>
            <span className="domain-count">{group.tabs.length}</span>
          </div>
          {/* 该列的 Tab 列表 */}
          <div className="kanban-col-body">
            {group.tabs.map(tab => (
              <div key={tab.id} data-tab-id={tab.id} className={`kanban-card ${tab.id && selectedIds.has(tab.id) ? 'selected' : ''}`} onClick={() => onSwitch(tab)}>
                <div className="kanban-card-top">
                  {getRenderableFaviconUrl(tab.favIconUrl)
                    ? <img className="tab-favicon" src={getRenderableFaviconUrl(tab.favIconUrl)} alt=""
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    : <div className="tab-favicon-ph" />
                  }
                  <div className="tab-actions">
                    <button className="tab-action-btn tab-bookmark always-visible" onClick={e => { e.stopPropagation(); onAddToBookmark?.(tab) }} title={t('newtab_addToBookmarks')}>★</button>
                    <button className="tab-action-btn tab-quicklink always-visible" onClick={e => { e.stopPropagation(); onAddToQuickLink?.(tab) }} title={t('newtab_addToQuickLinks')}>📌</button>
                    <button className="tab-action-btn tab-send always-visible" onClick={e => onSend(e, tab)} title={t('newtab_sendToApp')}>↗</button>
                    <button className="tab-action-btn tab-close always-visible" onClick={e => onClose(e, tab)} title={t('newtab_closeAndArchive')}>✕</button>
                  </div>
                </div>
                <button className="nt-tab-trigger kanban-trigger" onClick={e => { e.stopPropagation(); onSwitch(tab) }}>
                  <span className="kanban-card-title">{tab.title || tab.url}</span>
                  <span className="tab-url kanban-card-url">{hostname(tab.url || '')}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
