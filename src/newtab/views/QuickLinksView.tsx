import React, { useState, useEffect, useRef } from 'react'
import { db } from '../../lib/db'
import { QuickLink } from '../../types'
import { hostname } from '../groupers'
import { CATEGORY_RULES, DEFAULT_CATEGORY_ID, categoryLabel, inferPageCategory } from '../../lib/page-category'
import { t, plural } from '../../lib/i18n'
import { getQuickLinkFallbackLabel, localFaviconUrl } from '../../lib/favicon'
import { Dialog } from './Dialog'

// ─── 布局模式类型 ───────────────────────────────────────────────
type LayoutMode = 'grid' | 'list2'

function QuickLinkIcon({ link, size }: { link: QuickLink; size: number }) {
  const [failed, setFailed] = useState(false)
  const iconUrl = failed ? undefined : localFaviconUrl(link.url, Math.max(32, size * 2))

  if (!iconUrl) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(7, Math.round(size * 0.28)),
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(124,140,248,0.24), rgba(16,185,129,0.2))',
          color: 'var(--card-title)',
          fontSize: Math.max(11, Math.round(size * 0.46)),
          fontWeight: 800,
          letterSpacing: '-0.04em',
        }}
      >
        {getQuickLinkFallbackLabel(link.title, link.url)}
      </span>
    )
  }

  return (
    <img
      src={iconUrl}
      alt={link.title}
      style={{ width: size, height: size, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

export function QuickLinksView() {
  const [quickLinks, setQuickLinks]       = useState<QuickLink[]>([])
  const [isAddingLink, setIsAddingLink]   = useState(false)
  const [newLinkUrl, setNewLinkUrl]       = useState('')
  const [newLinkTitle, setNewLinkTitle]   = useState('')
  const [newLinkCategory, setNewLinkCategory] = useState('')
  const [showNewCatInput, setShowNewCatInput]  = useState(false)  // true = 用户选了「新建分类」
  const [newLinkPrompt, setNewLinkPrompt] = useState('')
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [layoutMode, setLayoutMode]       = useState<LayoutMode>('grid')
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])

  // ─── 组拖拽状态 ───
  const dragGroupRef = useRef<string | null>(null)
  const dragOverGroupRef = useRef<string | null>(null)
  const [dragGroupActive, setDragGroupActive] = useState<string | null>(null)
  const [dropGroupTarget, setDropGroupTarget] = useState<string | null>(null)

  // ─── 拖拽状态 ───
  const dragLinkId   = useRef<number | null>(null)  // 正在拖的 link.id
  const dragOverId   = useRef<number | null>(null)  // 悬停目标 link.id
  const [dragActive, setDragActive] = useState<number | null>(null)   // 高亮拖拽项
  const [dropTarget, setDropTarget] = useState<number | null>(null)   // 高亮落点

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  useEffect(() => {
    loadLinks()
    const savedOrder = localStorage.getItem('ql_category_order')
    if (savedOrder) {
      try { setCategoryOrder(JSON.parse(savedOrder)) } catch (_) {}
    }
  }, [])

  const loadLinks = () => db.quickLinks.orderBy('order').toArray().then(setQuickLinks)

  // ─── 布局持久化 ───
  useEffect(() => {
    const saved = localStorage.getItem('ql_layout') as LayoutMode | null
    if (saved) setLayoutMode(saved)
  }, [])
  const switchLayout = (mode: LayoutMode) => {
    setLayoutMode(mode)
    localStorage.setItem('ql_layout', mode)
  }

  // 未分类链接的分组键：沿用本地化的「默认」标签，中文环境与旧版 ql_category_order 保持一致
  const defaultCategory = categoryLabel(DEFAULT_CATEGORY_ID)
  const builtinCategories = CATEGORY_RULES.map(([id]) => categoryLabel(id))
  const userCategories = quickLinks.map(l => l.category).filter(Boolean) as string[]
  const categories = Array.from(new Set([...builtinCategories, ...userCategories]))

  const displayCategories = Array.from(new Set(quickLinks.map(l => l.category || defaultCategory)))
  
  // 对 displayCategories 进行排序
  const sortedDisplayCategories = [...displayCategories].sort((a, b) => {
    const idxA = categoryOrder.indexOf(a)
    const idxB = categoryOrder.indexOf(b)
    if (idxA === -1 && idxB === -1) return 0
    if (idxA === -1) return 1
    if (idxB === -1) return -1
    return idxA - idxB
  })

  const groupedLinks = displayCategories.reduce((acc, cat) => {
    acc[cat] = quickLinks.filter(l => (l.category || defaultCategory) === cat)
    return acc
  }, {} as Record<string, QuickLink[]>)

  // ─── CRUD ─────────────────────────────────────────────────────
  async function handleSaveQuickLink(e: React.FormEvent) {
    e.preventDefault()
    if (!newLinkUrl) return
    let url = newLinkUrl
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url
    const domain = new URL(url).hostname
    let category = newLinkCategory.trim() || undefined
    if (!category) {
      const inferred = inferPageCategory(url, newLinkTitle)
      category = inferred === defaultCategory ? undefined : inferred
    }
    const prompt = newLinkPrompt.trim() || undefined
    if (editingLinkId) {
      // 旧版保存的远程图标地址不再使用，编辑时一并清掉
      const updated = { url, title: newLinkTitle || domain, iconUrl: undefined, category, prompt }
      await db.quickLinks.update(editingLinkId, updated)
    } else {
      const order = quickLinks.length > 0 ? Math.max(...quickLinks.map(l => l.order)) + 1 : 0
      await db.quickLinks.add({ url, title: newLinkTitle || domain, order, category, prompt })
    }
    setIsAddingLink(false); setEditingLinkId(null)
    setNewLinkUrl(''); setNewLinkTitle(''); setNewLinkCategory(''); setNewLinkPrompt('')
    loadLinks()
  }

  async function handleRemoveQuickLink(e: React.MouseEvent, id?: number) {
    e.preventDefault(); e.stopPropagation()
    if (!id) return
    await db.quickLinks.delete(id)
    setQuickLinks(quickLinks.filter(l => l.id !== id))
  }

  function handleEditQuickLink(e: React.MouseEvent, link: QuickLink) {
    e.preventDefault(); e.stopPropagation()
    setEditingLinkId(link.id || null)
    setNewLinkUrl(link.url); setNewLinkTitle(link.title)
    setNewLinkCategory(link.category || '')
    setNewLinkPrompt(link.prompt || '')
    setIsAddingLink(true)
  }

  // ─── 拖拽排序 ─────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: number) {
    e.stopPropagation()
    dragLinkId.current = id
    setDragActive(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, id: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverId.current = id
    setDropTarget(id)
  }

  function onDragLeave() {
    setDropTarget(null)
  }

  async function onDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault()
    setDragActive(null); setDropTarget(null)
    const fromId = dragLinkId.current
    if (!fromId || fromId === targetId) return

    // 重新排列：把拖拽项插入目标位置
    const newOrder = [...quickLinks]
    const fromIdx = newOrder.findIndex(l => l.id === fromId)
    const toIdx   = newOrder.findIndex(l => l.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [removed] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, removed)

    // 更新 order 字段并持久化
    const updates = newOrder.map((l, i) => ({ ...l, order: i }))
    setQuickLinks(updates)
    await Promise.all(updates.map(l => db.quickLinks.update(l.id!, { order: l.order })))
    dragLinkId.current = null; dragOverId.current = null
  }

  function onDragEnd() {
    setDragActive(null); setDropTarget(null)
    dragLinkId.current = null; dragOverId.current = null
  }

  // ─── 组拖拽逻辑 ───
  function onGroupDragStart(e: React.DragEvent, cat: string) {
    e.stopPropagation()
    dragGroupRef.current = cat
    setDragGroupActive(cat)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onGroupDragOver(e: React.DragEvent, cat: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dragOverGroupRef.current = cat
    setDropGroupTarget(cat)
  }

  function onGroupDragLeave() {
    setDropGroupTarget(null)
  }

  function onGroupDrop(e: React.DragEvent, targetCat: string) {
    e.preventDefault()
    e.stopPropagation()
    setDragGroupActive(null)
    setDropGroupTarget(null)
    const fromCat = dragGroupRef.current
    if (!fromCat || fromCat === targetCat) return

    const newOrder = [...categoryOrder]
    if (!newOrder.includes(fromCat)) newOrder.push(fromCat)
    if (!newOrder.includes(targetCat)) newOrder.push(targetCat)
    
    // 把没在里面的一起按原顺序放进去，保证一致性
    displayCategories.forEach(c => {
      if (!newOrder.includes(c)) newOrder.push(c)
    })

    const fromIdx = newOrder.indexOf(fromCat)
    const toIdx = newOrder.indexOf(targetCat)
    
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, fromCat)
    
    setCategoryOrder(newOrder)
    localStorage.setItem('ql_category_order', JSON.stringify(newOrder))
    
    dragGroupRef.current = null; dragOverGroupRef.current = null
  }

  function onGroupDragEnd() {
    setDragGroupActive(null); setDropGroupTarget(null)
    dragGroupRef.current = null; dragOverGroupRef.current = null
  }

  // ─── 渲染单个 Link 卡片（两种模式） ──────────────────────────
  function renderLinkItem(link: QuickLink) {
    const isDragging  = dragActive === link.id
    const isOverThis  = dropTarget === link.id

    const iconImg = <QuickLinkIcon link={link} size={layoutMode === 'grid' ? 32 : 24} />

    const commonDragProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent) => onDragStart(e, link.id!),
      onDragOver:  (e: React.DragEvent) => onDragOver(e, link.id!),
      onDragLeave: onDragLeave,
      onDrop:      (e: React.DragEvent) => onDrop(e, link.id!),
      onDragEnd:   onDragEnd,
    }

    return (
      <div
        key={link.id}
        className={`ql-entry ${layoutMode === 'grid' ? 'grid' : 'list'}`}
        {...commonDragProps}
        style={{
          opacity: isDragging ? 0.4 : 1,
          outline: isOverThis ? '2px solid var(--accent)' : undefined,
        }}
      >
        <a href={link.url} className="ql-link" title={link.title}>
          <div className="ql-icon-wrap">{iconImg}</div>
          <div className="ql-copy">
            <span className="ql-link-label">{link.title}</span>
            {layoutMode === 'list2' && <span className="ql-link-url">{hostname(link.url)}</span>}
          </div>
          {link.prompt && <div className="ql-tooltip"><span>{t('quicklinks_promptLabel')}</span>{link.prompt}</div>}
        </a>
        <div className="ql-entry-actions">
          <button onClick={e => handleEditQuickLink(e, link)} className="ql-edit-btn" aria-label={t('quicklinks_editNamed', { title: link.title })} title={t('quicklinks_editLink')}>✎</button>
          <button onClick={e => handleRemoveQuickLink(e, link.id)} className="ql-delete-btn" aria-label={t('quicklinks_deleteNamed', { title: link.title })} title={t('quicklinks_deleteLink')}>×</button>
        </div>
      </div>
    )
  }

  // ─── 主渲染 ──────────────────────────────────────────────────
  return (
    <div className="nt-section" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ─── 顶部工具栏：布局切换 ─── */}
      <div className="ql-toolbar">
        <span className="ql-summary">{plural('quicklinks_siteCount_one', 'quicklinks_siteCount_other', quickLinks.length)} · {plural('quicklinks_categoryCount_one', 'quicklinks_categoryCount_other', displayCategories.length)}</span>
        <div className="ql-layout-controls" role="group" aria-label={t('quicklinks_layout')}>
        <button
          onClick={() => switchLayout('grid')}
          title={t('quicklinks_gridMode')}
          aria-pressed={layoutMode === 'grid'}
          style={{
            padding: '4px 10px', borderRadius: 'var(--lg-radius-sm)', border: 'none', cursor: 'pointer', fontSize: '12px',
            background: layoutMode === 'grid' ? 'var(--accent)' : 'var(--lg-fill-thin)',
            color: layoutMode === 'grid' ? 'var(--text-on-accent, #fff)' : 'var(--workspace-muted)',
            transition: 'background 0.15s',
          }}
        >⊕ {t('quicklinks_grid')}</button>
        <button
          onClick={() => switchLayout('list2')}
          title={t('quicklinks_listMode')}
          aria-pressed={layoutMode === 'list2'}
          style={{
            padding: '4px 10px', borderRadius: 'var(--lg-radius-sm)', border: 'none', cursor: 'pointer', fontSize: '12px',
            background: layoutMode === 'list2' ? 'var(--accent)' : 'var(--lg-fill-thin)',
            color: layoutMode === 'list2' ? 'var(--text-on-accent, #fff)' : 'var(--workspace-muted)',
            transition: 'background 0.15s',
          }}
        >⊟ {t('quicklinks_list')}</button>
        </div>
        <button className="nt-batch-btn" onClick={() => setIsAddingLink(true)}>＋ {t('quicklinks_addSite')}</button>
      </div>

      {/* ─── 分类分组 ─── */}
      <div className={`ql-category-layout ${layoutMode}`}>
        {sortedDisplayCategories.map(cat => (
          <div key={cat} className="nt-quicklink-group"
            style={{ 
              opacity: dragGroupActive === cat ? 0.4 : 1,
              outline: dropGroupTarget === cat ? '2px solid var(--accent, #4f8ef7)' : undefined,
              outlineOffset: '3px',
              cursor: 'default'
            }}
            draggable
            onDragStart={(e) => onGroupDragStart(e, cat)}
            onDragOver={(e) => onGroupDragOver(e, cat)}
            onDragLeave={onGroupDragLeave}
            onDrop={(e) => onGroupDrop(e, cat)}
            onDragEnd={onGroupDragEnd}
          >
            {(sortedDisplayCategories.length > 1 || cat !== defaultCategory) && (
              <h4
                style={{
                  margin: '0 0 12px 0', fontSize: '13px', color: 'var(--workspace-muted)',
                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                }}
                className="nt-quicklink-header"
              >
                <button onClick={() => toggleCategory(cat)} style={{
                  background: 'none', border: 'none', color: 'var(--workspace-muted)', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600
                }} aria-expanded={!collapsedCategories.has(cat)}>
                  <span style={{ fontSize: '10px' }}>{collapsedCategories.has(cat) ? '▶' : '▼'}</span> {cat}
                </button>
                <span className="ql-category-count">{groupedLinks[cat].length}</span>
                <span style={{ marginInlineStart: 'auto', fontSize: '12px', color: 'var(--workspace-muted)', cursor: 'grab', opacity: 0.5, padding: '0 4px' }} title={t('quicklinks_dragToSort')}>⠿</span>
              </h4>
            )}

            {!collapsedCategories.has(cat) && (
              <div className={`ql-link-collection ${layoutMode}`}>
                {groupedLinks[cat].map(link => renderLinkItem(link))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ─── 添加按钮区 ─── */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setIsAddingLink(true)}
          title={t('quicklinks_addFavoriteSite')}
          style={{
            width: '56px', height: '56px', borderRadius: 'var(--lg-radius-md)',
            background: 'var(--lg-fill)', border: '1px dashed var(--lg-stroke)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-muted)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {quickLinks.length === 0 && (
          <button
            onClick={async () => {
              const geekCategory = t('quicklinks_geekCommunity')
              await db.quickLinks.clear()
              await db.quickLinks.bulkAdd([
                { title: 'NodeSeek', url: 'https://www.nodeseek.com/', iconUrl: 'https://www.nodeseek.com/favicon.ico', category: geekCategory, order: 0 },
                { title: 'LINUX DO', url: 'https://linux.do/', iconUrl: 'https://linux.do/favicon.ico', category: geekCategory, order: 1 },
                { title: 'V2EX',     url: 'https://v2ex.com/', iconUrl: 'https://v2ex.com/static/favicon.ico', category: geekCategory, order: 2 },
              ])
              loadLinks()
            }}
            className="nt-batch-btn"
            style={{ padding: '0 16px', height: '36px', borderRadius: '18px', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          >
            {t('quicklinks_fillGeekCommunity')}
          </button>
        )}
      </div>

      {/* ─── 模态窗：添加/编辑表单 ─── */}
      {isAddingLink && (
        <Dialog label={editingLinkId ? t('quicklinks_editLink') : t('quicklinks_addLink')}
          onClose={() => { setIsAddingLink(false); setEditingLinkId(null); setNewLinkUrl(''); setNewLinkTitle(''); setNewLinkCategory(''); setNewLinkPrompt(''); setShowNewCatInput(false) }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleSaveQuickLink}
            style={{
              display: 'flex', flexDirection: 'column', gap: '12px',
              background: 'var(--bg-card-solid)', padding: '24px', borderRadius: 'var(--lg-radius-lg)',
              width: '100%',
              border: '1px solid var(--lg-stroke)'
            }}
          >
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {editingLinkId ? t('quicklinks_editLink') : t('quicklinks_addLink')}
            </h3>
            
            <input autoFocus aria-label={t('quicklinks_url')} required placeholder={t('quicklinks_urlPlaceholder')} value={newLinkUrl}
              onChange={e => setNewLinkUrl(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--lg-stroke)', background: 'transparent', color: 'var(--text-primary)' }} />
            
            <input aria-label={t('quicklinks_titleLabel')} placeholder={t('quicklinks_titlePlaceholder')} value={newLinkTitle}
              onChange={e => setNewLinkTitle(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--lg-stroke)', background: 'transparent', color: 'var(--text-primary)' }} />
            
            {/* 分类选择：已有分类时显示 select，选"新建"后切换到 input */}
            {categories.length > 0 && !showNewCatInput ? (
              <select
                aria-label={t('quicklinks_category')}
                value={categories.includes(newLinkCategory) ? newLinkCategory : categories[0]}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setShowNewCatInput(true)
                    setNewLinkCategory('')
                  } else {
                    setNewLinkCategory(e.target.value)
                  }
                }}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--lg-stroke)', background: 'var(--bg-card-solid)', color: 'var(--text-primary)', width: '100%', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '32px' }}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                <option value="__new__">＋ {t('quicklinks_newCategoryOption')}</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  aria-label={t('quicklinks_newCategoryName')}
                  placeholder={t('quicklinks_newCategoryPlaceholder')}
                  value={newLinkCategory}
                  onChange={e => setNewLinkCategory(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
                  autoFocus
                />
                {/* 有现有分类时，可以切回 select */}
                {categories.length > 0 && (
                  <button type="button" onClick={() => { setShowNewCatInput(false); setNewLinkCategory(categories[0]) }}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--lg-stroke)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}
                  >{t('quicklinks_backToSelect')}</button>
                )}
              </div>
            )}
            
            <textarea aria-label={t('quicklinks_promptLabel')} placeholder={t('quicklinks_promptPlaceholder')} value={newLinkPrompt}
              onChange={e => setNewLinkPrompt(e.target.value)}
              rows={3}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical' }} />
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="nt-batch-btn primary" style={{ flex: 1, height: '36px' }}>
                {editingLinkId ? t('quicklinks_saveChanges') : t('quicklinks_confirmAdd')}
              </button>
              <button type="button" className="nt-batch-btn" style={{ flex: 1, height: '36px' }}
                onClick={() => { setIsAddingLink(false); setEditingLinkId(null); setNewLinkUrl(''); setNewLinkTitle(''); setNewLinkCategory(''); setNewLinkPrompt(''); setShowNewCatInput(false) }}>
                {t('common_cancel')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
