import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('workspace navigation is visible and its active state is accessible', () => {
  const source = read('./NewTab.tsx')
  assert.match(source, /aria-label="主导航"/)
  assert.match(source, /aria-current=\{isActive/)
  assert.match(read('./NewTab.css'), /\.nt-root\.dark \.nt-right-nav-item\.active\s*\{[^}]*background: rgba\(255,255,255,0\.14\)/)
  assert.doesNotMatch(read('./NewTab.css'), /width: 8px;\s*pointer-events: all/)
})

test('layout choices reuse one navigation and normalize live preference updates', () => {
  const source = read('./NewTab.tsx')
  assert.match(source, /layout-\$\{settings.navigationLayout\}/)
  assert.equal((source.match(/orderedNavItems\.map\(/g) || []).length, 1)
  assert.match(source, /next.navigationLayout = normalizeNavigationLayout\(next.navigationLayout\)/)
  const modal = read('./views/SettingsModal.tsx')
  assert.match(modal, /type="radio"/)
  assert.match(modal, /name="navigationLayout"/)
  assert.match(modal, /onSettingChange\('navigationLayout', o.value\)/)
  assert.match(read('../options/Options.tsx'), /update\('navigationLayout'/)
})

test('sidebar styling is bounded to roomy windows and keeps shared glass materials', () => {
  const css = read('./NewTab.css')
  assert.match(css, /@media \(min-width: 641px\) and \(min-height: 520px\)/)
  assert.match(css, /\.nt-root\.layout-sidebar\s*\{[^}]*padding-inline-start:/)
  assert.match(css, /\.layout-sidebar \.nt-right-nav-wrap\s*\{[^}]*inset-inline-start:/)
  assert.match(css, /\.nt-layout-input:focus-visible \+ \.nt-layout-card/)
})

test('classic is discoverable in both existing settings surfaces', () => {
  const modal = read('./views/SettingsModal.tsx')
  assert.match(modal, /value: 'classic', title: '经典右侧'/)
  assert.match(read('../options/Options.tsx'), /<option value="classic">经典右侧/)
  assert.match(read('./NewTab.css'), /\.nt-layout-preview\.classic\s*\{[^}]*flex-direction: row-reverse/)
})

test('classic keeps a logical-end rail and centered clock without duplicating actions', () => {
  const css = read('./NewTab.css')
  assert.match(css, /\.nt-root\.layout-classic\s*\{[^}]*padding-inline-end:/)
  assert.match(css, /\.layout-classic \.nt-right-nav-wrap\s*\{[^}]*inset-inline-end:/)
  assert.match(css, /\.layout-classic \.nt-clock-area\s*\{[^}]*flex-direction: column/)
  assert.match(css, /\.layout-classic \.nt-sticky-top\s*\{[^}]*background: transparent/)
  assert.equal((read('./NewTab.tsx').match(/orderedNavItems\.map\(/g) || []).length, 1)
})

test('quick link collections use bounded responsive grids instead of title-sized rows', () => {
  const source = read('./views/QuickLinksView.tsx')
  assert.match(source, /ql-category-layout/)
  assert.match(source, /ql-link-collection/)
  assert.match(source, /aria-expanded=\{!collapsedCategories/)
  assert.match(read('./NewTab.css'), /prefers-reduced-motion: reduce/)
})

test('settings use a native modal with cancel handling instead of an unfocused overlay', () => {
  assert.match(read('./views/Dialog.tsx'), /showModal\(\)/)
  assert.match(read('./views/Dialog.tsx'), /onCancel/)
  assert.match(read('./views/SettingsModal.tsx'), /<Dialog/)
  assert.ok(/<Dialog label="收藏到书签"/.test(read('./NewTab.tsx')))
  assert.ok(/<Dialog label="添加到常用导航"/.test(read('./NewTab.tsx')))
})

test('search has one focus indicator and category drag targets do not shift the layout', () => {
  assert.match(read('./NewTab.css'), /\.nt-root \.nt-search-input:focus-visible\s*\{\s*outline: none/)
  assert.doesNotMatch(read('./views/QuickLinksView.tsx'), /paddingTop: dropGroupTarget/)
})

test('all tab views receive action handlers and the popup never substitutes another current page', () => {
  assert.equal((read('./NewTab.tsx').match(/<KanbanView \{\.\.\.viewProps\}/g) || []).length, 2)
  assert.doesNotMatch(read('../popup/App.tsx'), /activeTabs\.find\(isSupportedTab\)\s*\|\|\s*usableTabs\[0\]/)
  assert.doesNotMatch(read('../popup/App.tsx'), /setCurrentTab\(remainingTabs\.find/)
  for (const file of ['GridView.tsx', 'ListView.tsx', 'KanbanView.tsx']) {
    assert.ok(/className="nt-tab-trigger\b[^\"]*"/.test(read(`./views/${file}`)), `${file} provides a keyboard-operable tab trigger`)
  }
})

test('popup content scrolls inside a bounded root and selection is keyboard operable', () => {
  assert.ok(/html, #root\s*\{[^}]*height: 100%/.test(read('../popup/App.css')))
  assert.match(read('../popup/App.css'), /body\s*\{[^}]*height: 600px;/)
  assert.doesNotMatch(read('../popup/App.css'), /height: min\(600px, 100vh\)/)
  assert.ok(/type="checkbox"/.test(read('../popup/App.tsx')))
  assert.ok(/pop-search-input:focus-visible\s*\{\s*outline: none/.test(read('../popup/App.css')))
  assert.doesNotMatch(read('../popup/App.tsx'), /className="pop-search-input" autoFocus/)
  assert.ok(/\.pop-body > \*\s*\{\s*flex-shrink: 0/.test(read('../popup/App.css')))
})

test('wallpaper workspaces retain translucent surfaces and blurred navigation cards', () => {
  const css = read('./NewTab.css')
  for (const selector of ['.nt-root.has-wallpaper', '.nt-root.dark.has-wallpaper']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
    const surface = block.match(/--workspace-surface:\s*rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)
    assert.ok(surface, `${selector} provides its own glass material`)
    assert.ok(Number(surface[1]) <= 0.75, `${selector} must let the wallpaper show through`)
    assert.match(block, /--workspace-card-surface:/)
  }
  const entry = css.slice(css.indexOf('.ql-entry {')).split('}')[0]
  assert.match(entry, /backdrop-filter: blur\(var\(--lg-blur\)\)/)
  assert.match(entry, /-webkit-backdrop-filter: blur\(var\(--lg-blur\)\)/)
  assert.match(css, /background: var\(--workspace-card-surface\)/)
  const body = css.slice(css.indexOf('.nt-root.has-wallpaper .nt-scroll-body {')).split('}')[0]
  assert.match(body, /background: var\(--workspace-body-surface\)/)
  assert.match(body, /backdrop-filter: none/)
  assert.match(css, /\.nt-root\.has-wallpaper :is\(\.tab-card, \.list-row, \.kanban-card\)\.selected/)
  assert.match(read('./views/BookmarksView.tsx'), /background: 'var\(--workspace-card-surface, var\(--lg-fill\)\)'/)
})
