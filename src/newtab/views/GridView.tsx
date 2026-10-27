import { TabGroup, hostname } from '../groupers'
import { getRenderableFaviconUrl } from '../../lib/favicon'
import { t } from '../../lib/i18n'

interface Props {
  groups: TabGroup[]
  collapsedIds: Set<string>
  onToggleCollapse: (id: string) => void
  onSwitch: (tab: chrome.tabs.Tab) => void
  onClose: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void
  onSend: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void
  hideGroupHeader?: boolean   // groupBy=none 时隐藏分组标题
  selectedIds: Set<number>
  onAddToQuickLink?: (tab: chrome.tabs.Tab) => void
  onAddToBookmark?: (tab: chrome.tabs.Tab) => void
}

export function GridView({ groups, collapsedIds, onToggleCollapse, onSwitch, onClose, onSend, hideGroupHeader, selectedIds, onAddToQuickLink, onAddToBookmark }: Props) {
  return (
    <div className="view-grid-root">
      {groups.map(group => {
        const isCollapsed = collapsedIds.has(group.id)
        const favicon = getRenderableFaviconUrl(group.tabs.find(t => getRenderableFaviconUrl(t.favIconUrl))?.favIconUrl)
        return (
          <div key={group.id} className="domain-group">
            {!hideGroupHeader && (
              <button className="domain-header" aria-expanded={!isCollapsed} onClick={() => onToggleCollapse(group.id)}>
                <span className="domain-header-left">
                  {favicon
                    ? <img className="domain-favicon" src={favicon} alt=""
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    : <span className="domain-favicon-placeholder" />
                  }
                  <span className="domain-name">{group.label}</span>
                  <span className="domain-count">{group.tabs.length}</span>
                </span>
                <span className={`domain-chevron ${isCollapsed ? '' : 'open'}`}>›</span>
              </button>
            )}
            {!isCollapsed && (
              <div className="tabs-grid">
                {group.tabs.map(tab => (
                  <div key={tab.id} data-tab-id={tab.id} className={`tab-card ${tab.id && selectedIds.has(tab.id) ? 'selected' : ''}`}>
                    <button className="nt-tab-trigger" onClick={() => onSwitch(tab)} title={tab.title || tab.url}>
                    {getRenderableFaviconUrl(tab.favIconUrl)
                      ? <img className="tab-favicon" src={getRenderableFaviconUrl(tab.favIconUrl)} alt=""
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      : <div className="tab-favicon-ph" />
                    }
                    <div className="tab-info">
                      <div className="tab-title">{tab.title || tab.url}</div>
                      <div className="tab-url">{hostname(tab.url || '')}</div>
                    </div>
                    </button>
                    <div className="tab-actions">
                      <button className="tab-action-btn tab-bookmark" onClick={e => { e.stopPropagation(); onAddToBookmark?.(tab) }} title={t('newtab_addToBookmarks')}>★</button>
                      <button className="tab-action-btn tab-quicklink" onClick={e => { e.stopPropagation(); onAddToQuickLink?.(tab) }} title={t('newtab_addToQuickLinks')}>📌</button>
                      <button className="tab-action-btn tab-send" onClick={e => onSend(e, tab)} title={t('newtab_sendToApp')}>↗</button>
                      <button className="tab-action-btn tab-close" onClick={e => onClose(e, tab)} title={t('newtab_closeAndArchive')}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
