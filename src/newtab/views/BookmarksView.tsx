import React, { useState, useEffect } from 'react'
import { errMsg } from '../../lib/errors'
import { sendToJustDoIt } from '../../lib/justdoit'
import { t } from '../../lib/i18n'

// 文件夹颜色调色盘（按 id hash 确定性分配，不同文件夹不同色）
const FOLDER_COLORS = [
  '#3B82F6', // 蓝
  '#10B981', // 翠绿
  '#F59E0B', // 琥珀
  '#8B5CF6', // 紫罗兰
  '#EF4444', // 红
  '#EC4899', // 粉
  '#06B6D4', // 青
  '#F97316', // 橙
  '#84CC16', // 青柠
  '#6366F1', // 靛蓝
]

function getFolderColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff
  return FOLDER_COLORS[h % FOLDER_COLORS.length]
}

// 文件夹——带短耳（类似 macOS Finder 文件夹）
const FolderIcon = ({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    {/* 底部主体 */}
    <path d="M3 8h18a1 1 0 011 1v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h4l2 2h9a1 1 0 011 1v1" />
    {/* 耳 */}
    <path d="M3 8V6a2 2 0 012-2h4l2 2H3z" fill={color} fillOpacity="0.15" stroke="none" />
  </svg>
)

// 书签链接——带地球小点（区分于导航栏的纯书签形）
const LinkIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>
)

// 左侧树形节点组件
interface FolderTreeItemProps {
  node: chrome.bookmarks.BookmarkTreeNode
  currentId: string
  onSelect: (node: chrome.bookmarks.BookmarkTreeNode) => void
  onDropNode: (draggedId: string, targetId: string) => void
}

function FolderTreeItem({ node, currentId, onSelect, onDropNode }: FolderTreeItemProps) {
  const isFolder = !node.url
  if (!isFolder) return null // 左侧只渲染文件夹

  const [expanded, setExpanded] = useState(node.id === '1' || node.id === '0' || node.id === '2')
  const [dragOver, setDragOver] = useState(false)

  const isCurrent = node.id === currentId

  return (
    <div style={{ paddingLeft: '12px' }}>
      <div 
        style={{ 
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
          background: isCurrent ? 'var(--accent-light)' : dragOver ? 'var(--lg-fill)' : 'transparent',
          color: isCurrent ? 'var(--accent)' : 'var(--text-primary)',
          border: dragOver ? '1px dashed var(--accent)' : isCurrent ? '1px solid color-mix(in srgb, var(--accent) 35%, transparent)' : '1px solid transparent',
          fontSize: '13px',
          fontWeight: isCurrent ? 600 : 500,
          transition: 'all 0.2s'
        }}
        onClick={() => {
           if (node.children && node.children.length > 0) {
             setExpanded(true)
           }
           onSelect(node)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragOver) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const draggedId = e.dataTransfer.getData('text/plain')
          if (draggedId && draggedId !== node.id) {
            onDropNode(draggedId, node.id)
          }
        }}
      >
        <span style={{ fontSize: '12px', width: '16px', display: 'inline-block', textAlign: 'center' }} onClick={(e) => {
           e.stopPropagation()
           setExpanded(!expanded)
        }}>
          {node.children && node.children.some((c) => !c.url) ? (expanded ? '▾' : '▸') : ''}
        </span>
        <FolderIcon size={16} color={getFolderColor(node.id)} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title || t('common_untitled')}
        </span>
      </div>
      {expanded && node.children && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
          {node.children.map((child) => (
             <FolderTreeItem key={child.id} node={child} currentId={currentId} onSelect={onSelect} onDropNode={onDropNode} />
          ))}
        </div>
      )}
    </div>
  )
}

export function BookmarksView({ showToast }: { showToast: (msg: string) => void }) {
  const [rootNodes, setRootNodes] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  const [currentNodeId, setCurrentNodeId] = useState<string>('0')
  const [children, setChildren] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])
  const [path, setPath] = useState<{ id: string, title: string }[]>([{ id: '0', title: t('bookmarks_root') }])
  
  // 编辑状态
  const [editingNode, setEditingNode] = useState<{ id: string, title: string, url: string } | null>(null)
  
  // 视图模式
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid')
  
  // 排序状态
  const [sortDragId, setSortDragId] = useState<string | null>(null)
  const [sortDragDirection, setSortDragDirection] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    const savedMode = localStorage.getItem('tab-butler-bm-viewmode') as 'grid' | 'list' | 'compact' | null
    if (savedMode) {
      setViewMode(savedMode)
    }
  }, [])

  function handleViewModeChange(mode: 'grid' | 'list' | 'compact') {
    setViewMode(mode)
    localStorage.setItem('tab-butler-bm-viewmode', mode)
  }

  function loadTree() {
    if (chrome.bookmarks) {
      chrome.bookmarks.getTree(nodes => {
        if (nodes && nodes.length > 0) {
          const rootChildren = nodes[0].children || []
          setRootNodes(rootChildren)
          
          if (currentNodeId === '0') {
             const bookmarksBar = rootChildren.find(n => n.id === '1') || rootChildren[0]
             if (bookmarksBar) {
               setCurrentNodeId(bookmarksBar.id)
               setPath([{ id: bookmarksBar.id, title: bookmarksBar.title || t('bookmarks_bar') }])
             }
          }
        }
      })
    }
  }

  function loadCurrentFolder(id: string) {
    if (id && chrome.bookmarks) {
      chrome.bookmarks.getSubTree(id, results => {
        if (results && results.length > 0) {
          setChildren(results[0].children || [])
        }
      })
    }
  }

  useEffect(() => {
    loadTree()
  }, [])

  useEffect(() => {
    if (currentNodeId !== '0') {
      loadCurrentFolder(currentNodeId)
    }
  }, [currentNodeId])

  function handleNodeClick(node: chrome.bookmarks.BookmarkTreeNode) {
    if (node.url) {
      chrome.tabs.create({ url: node.url, active: false })
    } else {
      setCurrentNodeId(node.id)
      setPath([...path, { id: node.id, title: node.title }])
    }
  }

  function handleSelectFromTree(node: chrome.bookmarks.BookmarkTreeNode) {
    setCurrentNodeId(node.id)
    setPath([{ id: '0', title: t('bookmarks_root') }, { id: node.id, title: node.title }])
  }

  function handleDropNode(draggedId: string, targetFolderId: string) {
    chrome.bookmarks.move(draggedId, { parentId: targetFolderId }, () => {
      loadTree()
      loadCurrentFolder(currentNodeId)
      showToast(t('bookmarks_moved'))
    })
  }

  function handleSaveEdit(id: string) {
    if (!editingNode) return
    chrome.bookmarks.update(id, { title: editingNode.title, url: editingNode.url }, () => {
       setEditingNode(null)
       loadTree()
       loadCurrentFolder(currentNodeId)
       showToast(t('bookmarks_updated'))
    })
  }

  function handleSortDrop(draggedId: string, targetNode: chrome.bookmarks.BookmarkTreeNode, direction: 'before' | 'after') {
    if (draggedId === targetNode.id) return // 拖给自己没意义
    let targetIndex = targetNode.index || 0
    if (direction === 'after') targetIndex += 1
    
    chrome.bookmarks.move(draggedId, { parentId: currentNodeId, index: targetIndex }, () => {
      loadTree()
      loadCurrentFolder(currentNodeId)
      setSortDragId(null)
    })
  }

  const renderCard = (node: chrome.bookmarks.BookmarkTreeNode) => {
    const isFolder = !node.url
    const isEditing = editingNode?.id === node.id

    return (
      <div 
        key={node.id} 
        className="bm-card"
        draggable={!isEditing}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', node.id)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const mid = rect.left + rect.width / 2
          const direction = e.clientX < mid ? 'before' : 'after'
          if (sortDragId !== node.id || sortDragDirection !== direction) {
             setSortDragId(node.id)
             setSortDragDirection(direction)
          }
        }}
        onDragLeave={() => {
          setSortDragId(null)
          setSortDragDirection(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation() // 阻止冒泡到外层
          const draggedId = e.dataTransfer.getData('text/plain')
          if (draggedId && sortDragDirection) {
            handleSortDrop(draggedId, node, sortDragDirection)
          }
          setSortDragId(null)
          setSortDragDirection(null)
        }}
        onClick={() => !isEditing && handleNodeClick(node)} 
        style={{
          background: 'var(--workspace-card-surface, var(--lg-fill))',
          padding: viewMode === 'compact' ? '8px 10px' : (isFolder ? '10px' : '12px'),
          borderRadius: 'var(--lg-radius-md)',
          cursor: isEditing ? 'default' : (isFolder ? 'pointer' : 'grab'),
          display: 'flex',
          alignItems: viewMode === 'compact' ? 'center' : 'flex-start',
          gap: '10px',
          border: '1px solid var(--lg-stroke)',
          position: 'relative',
          boxShadow: 'var(--lg-shadow)',
          transition: 'transform 0.2s',
          borderLeft: sortDragId === node.id && sortDragDirection === 'before'
            ? '3px solid var(--accent)'
            : isFolder ? `3px solid ${getFolderColor(node.id)}` : '1px solid var(--lg-stroke)',
          borderRight: sortDragId === node.id && sortDragDirection === 'after' ? '3px solid var(--accent)' : '1px solid transparent'
        }}>
        
        <div style={{ fontSize: (isFolder || viewMode === 'compact') ? '16px' : '18px', paddingTop: viewMode === 'compact' ? '0' : '2px' }}>
          {isFolder
            ? <FolderIcon size={isFolder || viewMode === 'compact' ? 18 : 20} color={getFolderColor(node.id)} />
            : <LinkIcon size={viewMode === 'compact' ? 16 : 18} />
          }
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '24px' }} onClick={e => e.stopPropagation()}>
               <input 
                 autoFocus
                 className="nt-input" 
                 value={editingNode.title} 
                 onChange={e => setEditingNode({...editingNode, title: e.target.value})} 
                 placeholder={t('bookmarks_namePlaceholder')}
                 style={{ fontSize: '13px', padding: '6px 8px', width: '100%', background: 'var(--lg-fill-thin)', border: '1px solid var(--lg-stroke)', borderRadius: 'var(--lg-radius-sm)', color: 'var(--text-primary)' }}
               />
               {!isFolder && (
                 <input 
                   className="nt-input" 
                   value={editingNode.url} 
                   onChange={e => setEditingNode({...editingNode, url: e.target.value})} 
                   placeholder="URL"
                   style={{ fontSize: '12px', padding: '6px 8px', width: '100%', background: 'var(--lg-fill-thin)', border: '1px solid var(--lg-stroke)', borderRadius: 'var(--lg-radius-sm)', color: 'var(--text-muted)' }}
                 />
               )}
               <div style={{ display: 'flex', gap: '6px', position: 'absolute', bottom: '8px', left: '42px' }}>
                  <button onClick={(e) => { e.stopPropagation(); handleSaveEdit(node.id) }} className="nt-btn primary" style={{ fontSize: '12px', padding: '2px 10px', background: 'var(--accent)', color: 'var(--text-on-accent, #fff)', border: 'none', borderRadius: 'var(--lg-radius-sm)', cursor: 'pointer' }}>{t('common_save')}</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingNode(null) }} className="nt-btn" style={{ fontSize: '12px', padding: '2px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--lg-stroke)', borderRadius: 'var(--lg-radius-sm)', cursor: 'pointer' }}>{t('common_cancel')}</button>
               </div>
             </div>
          ) : (
            <>
              <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '16px' }}>
                {node.title || t('common_untitled')}
              </div>
              {(!isFolder && viewMode !== 'compact') && (
                <a
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="bm-url-link"
                  title={node.url}
                >
                  {node.url}
                </a>
              )}
            </>
          )}
        </div>
        
        {!isEditing && (
          <div className="bm-card-actions" style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setEditingNode({ id: node.id, title: node.title, url: node.url || '' })
              }} 
              className="ql-edit-btn"
              style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #fff)', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '0', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={t('common_edit')}
            >✎</button>
          </div>
        )}
        
        {(!isFolder && !isEditing) && (
           <button onClick={(e) => {
             e.stopPropagation()
             sendToJustDoIt({ title: node.title, url: node.url! })
               .then(() => showToast(t('bookmarks_sentToInbox')))
               .catch((err: unknown) => showToast(t('newtab_errorToast', { error: errMsg(err) ?? t('common_unknownError') })))
           }} className="nt-batch-btn primary" style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '3px 8px', fontSize: '10px', borderRadius: '4px', opacity: 0.8 }}>↗ Inbox</button>
        )}
      </div>
    )
  }

  return (
    <div className="nt-bookmarks-view" style={{ display: 'flex', height: '100%', gap: '20px', alignItems: 'flex-start' }}>
      
      {/* 左侧树结构 */}
      <div style={{ width: '240px', flexShrink: 0, height: '100%', overflowY: 'auto', background: 'var(--lg-fill-thin)', border: '1px solid var(--lg-stroke-soft)', borderRadius: 'var(--lg-radius-md)', padding: '12px 8px' }}>
         <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px', paddingLeft: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('bookmarks_folderTree')}</h3>
         {rootNodes.map(node => (
            <FolderTreeItem key={node.id} node={node} currentId={currentNodeId} onSelect={handleSelectFromTree} onDropNode={handleDropNode} />
         ))}
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div className="bm-breadcrumbs" style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '15px', color: 'var(--text-muted)' }}>
            {path.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                {index > 0 && <span>/</span>}
                <span 
                  onClick={() => {
                     // 支持点击面包屑返回
                     setCurrentNodeId(crumb.id)
                     setPath(path.slice(0, index + 1))
                  }}
                  style={{ cursor: 'pointer', color: index === path.length - 1 ? 'var(--text-primary)' : 'inherit', fontWeight: index === path.length - 1 ? 'bold' : 'normal' }}
                >
                  {crumb.title}
                </span>
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--lg-fill-thin)', padding: '4px', borderRadius: 'var(--lg-radius-sm)', border: '1px solid var(--lg-stroke)' }}>
             <button onClick={() => handleViewModeChange('grid')} style={{ border: 'none', background: viewMode === 'grid' ? 'var(--bg-card-solid)' : 'transparent', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)', padding: '4px 8px', borderRadius: 'var(--lg-radius-sm)', cursor: 'pointer', fontSize: '14px', boxShadow: viewMode === 'grid' ? 'var(--lg-shadow)' : 'none' }} title={t('bookmarks_gridView')}>𖣲</button>
             <button onClick={() => handleViewModeChange('list')} style={{ border: 'none', background: viewMode === 'list' ? 'var(--bg-card-solid)' : 'transparent', color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)', padding: '4px 8px', borderRadius: 'var(--lg-radius-sm)', cursor: 'pointer', fontSize: '14px', boxShadow: viewMode === 'list' ? 'var(--lg-shadow)' : 'none' }} title={t('bookmarks_listView')}>☰</button>
             <button onClick={() => handleViewModeChange('compact')} style={{ border: 'none', background: viewMode === 'compact' ? 'var(--bg-card-solid)' : 'transparent', color: viewMode === 'compact' ? 'var(--text-primary)' : 'var(--text-muted)', padding: '4px 8px', borderRadius: 'var(--lg-radius-sm)', cursor: 'pointer', fontSize: '14px', boxShadow: viewMode === 'compact' ? 'var(--lg-shadow)' : 'none' }} title={t('bookmarks_compactView')}>☷</button>
          </div>
        </div>

        {children.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '20px', gridColumn: '1 / -1', textAlign: 'center', padding: '40px', background: 'var(--lg-fill-thin)', borderRadius: 'var(--lg-radius-md)', border: '1px dashed var(--lg-stroke)' }}>
              {t('bookmarks_emptyFolder')}
            </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px' }}>
            {children.filter(n => !n.url).length > 0 && (
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('bookmarks_subfolders')}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                  {children.filter(n => !n.url).map(node => renderCard(node))}
                </div>
              </div>
            )}
            
            {children.filter(n => !!n.url).length > 0 && (
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('bookmarks_bookmarks')}</h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(240px, 1fr))' : (viewMode === 'list' ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))'), 
                  gap: viewMode === 'compact' ? '8px' : '14px' 
                }}>
                  {children.filter(n => !!n.url).map(node => renderCard(node))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
