import React from 'react'
import { Dialog } from './Dialog'
import { Download, Upload, X, type LucideIcon } from 'lucide-react'
import { Settings, GroupBy, ViewMode, Theme, NavSection, NavigationLayout } from '../../lib/settings'
import { GROUP_ICONS, SECTION_ICONS, THEME_ICONS, VIEW_ICONS } from '../../lib/choice-icons'
import { t, type MessageKey } from '../../lib/i18n'

const LAYOUT_OPTIONS: { value: NavigationLayout; title: MessageKey; desc: MessageKey }[] = [
  { value: 'top', title: 'settings_layoutTop', desc: 'settings_layoutTopDesc' },
  { value: 'sidebar', title: 'settings_layoutSidebar', desc: 'settings_layoutSidebarDesc' },
  { value: 'classic', title: 'settings_layoutClassic', desc: 'settings_layoutClassicDesc' },
]

// ── 选项数据 ──────────────────────────────────────────────────────
const GROUP_OPTIONS: { value: GroupBy; title: MessageKey; desc: MessageKey }[] = [
  { value: 'none',        title: 'settings_groupNone',        desc: 'settings_groupNoneDesc' },
  { value: 'domain',      title: 'settings_groupDomain',      desc: 'settings_groupDomainDesc' },
  { value: 'chromeGroup', title: 'settings_groupChromeGroup', desc: 'settings_groupChromeGroupDesc' },
  { value: 'window',      title: 'settings_groupWindow',      desc: 'settings_groupWindowDesc' },
  { value: 'time',        title: 'settings_groupTime',        desc: 'settings_groupTimeDesc' },
  { value: 'category',    title: 'settings_groupCategory',    desc: 'settings_groupCategoryDesc' },
]

const VIEW_OPTIONS: { value: ViewMode; title: MessageKey; desc: MessageKey }[] = [
  { value: 'grid',   title: 'settings_viewGrid',   desc: 'settings_viewGridDesc' },
  { value: 'list',   title: 'settings_viewList',   desc: 'settings_viewListDesc' },
  { value: 'kanban', title: 'settings_viewKanban', desc: 'settings_viewKanbanDesc' },
]

const THEME_OPTIONS: { value: Theme; title: MessageKey }[] = [
  { value: 'light', title: 'settings_themeLight' },
  { value: 'dark',  title: 'settings_themeDark' },
]

const DEFAULT_SECTION_OPTIONS: { value: NavSection; title: MessageKey; desc: MessageKey }[] = [
  { value: 'tabs',       title: 'settings_sectionTabs',       desc: 'settings_sectionTabsDesc' },
  { value: 'quicklinks', title: 'settings_sectionQuicklinks', desc: 'settings_sectionQuicklinksDesc' },
  { value: 'bookmarks',  title: 'settings_sectionBookmarks',  desc: 'settings_sectionBookmarksDesc' },
]

// ── 样式常量 ──────────────────────────────────────────────────────
const CARD_BASE: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
  padding: '14px 16px', borderRadius: 'var(--lg-radius-md)', cursor: 'pointer', textAlign: 'start',
  border: '1.5px solid var(--lg-stroke)',
  background: 'var(--lg-fill)',
  transition: 'border-color .15s, background .15s',
  position: 'relative', fontFamily: 'var(--font-apple)',
}
const CARD_SELECTED: React.CSSProperties = {
  borderColor: 'var(--accent)',
  background: 'var(--accent-light)',
  boxShadow: '0 0 0 3px var(--accent-light)',
}

// ── 组件 ─────────────────────────────────────────────────────────
interface Props {
  settings: Settings
  onSettingChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onClose: () => void
  onExport: () => void
  onImport: () => void
}

export function SettingsModal({ settings, onSettingChange, onClose, onExport, onImport }: Props) {
  return (
    <Dialog label={t('settings_title')} onClose={onClose} className="nt-settings-dialog">
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--lg-stroke)',
          borderRadius: 'var(--lg-radius-xl)',
          padding: '28px',
          width: '100%',
          animation: 'slideUp .22s ease-out',
          color: 'var(--text-primary)',
        }}
      >
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.3px' }}>{t('settings_title')}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('settings_subtitle')}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('settings_close')}
            style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          ><X size={20} aria-hidden="true" /></button>
        </div>

        <fieldset className="nt-layout-settings">
          <legend>{t('settings_navLayout')}</legend>
          <p id="navigation-layout-hint">{t('settings_navLayoutHint')}</p>
          <div className="nt-layout-choices">
            {LAYOUT_OPTIONS.map(o => (
              <label className="nt-layout-choice" key={o.value}>
                <input
                  className="nt-layout-input"
                  type="radio"
                  name="navigationLayout"
                  value={o.value}
                  checked={settings.navigationLayout === o.value}
                  aria-label={t(o.title)}
                  aria-describedby="navigation-layout-hint"
                  onChange={() => onSettingChange('navigationLayout', o.value)}
                />
                <span className="nt-layout-card">
                  <span className={`nt-layout-preview ${o.value}`} aria-hidden="true">
                    <span className="nt-layout-preview-nav"><i /><i /><i /></span>
                    <span className="nt-layout-preview-content"><i /><i /><i /></span>
                  </span>
                  <span className="nt-layout-choice-title">{t(o.title)}<span className="nt-layout-check" aria-hidden="true">✓</span></span>
                  <span className="nt-layout-choice-desc">{t(o.desc)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── 分组方式 ── */}
        <Section title={t('settings_groupByTitle')} desc={t('settings_groupByDesc')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {GROUP_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('groupBy', o.value)}
                style={{ ...CARD_BASE, ...(settings.groupBy === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={GROUP_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t(o.title)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t(o.desc)}</span>
                {settings.groupBy === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── 视图模式 ── */}
        <Section title={t('settings_viewTitle')} desc={t('settings_viewDesc')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {VIEW_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('viewMode', o.value)}
                style={{ ...CARD_BASE, ...(settings.viewMode === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={VIEW_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t(o.title)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t(o.desc)}</span>
                {settings.viewMode === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('settings_defaultSectionTitle')} desc={t('settings_defaultSectionDesc')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {DEFAULT_SECTION_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('defaultSection', o.value)}
                style={{ ...CARD_BASE, ...(settings.defaultSection === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={SECTION_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t(o.title)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t(o.desc)}</span>
                {settings.defaultSection === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── 外观主题 ── */}
        <Section title={t('settings_themeTitle')} desc={t('settings_themeDesc')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {THEME_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('theme', o.value)}
                style={{ ...CARD_BASE, ...(settings.theme === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={THEME_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>{t(o.title)}</span>
                {settings.theme === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('settings_privacyTitle')} desc={t('settings_privacyDesc')}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.enableRemoteQuotes} onChange={e => onSettingChange('enableRemoteQuotes', e.target.checked)} />
            <span>{t('settings_enableQuotes')}</span>
          </label>
          <p style={{ fontSize: 12, lineHeight: 1.6 }}>{t('settings_privacyNote')}</p>
          <button type="button" onClick={() => { void chrome.runtime.openOptionsPage() }} style={{ ...CARD_BASE, padding: '10px 14px' }}>{t('settings_openOptions')}</button>
        </Section>

        {/* ── 数据管理 ── */}
        <div style={{ borderTop: '1px solid var(--lg-stroke-soft)', paddingTop: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { onExport(); onClose() }}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: 'var(--lg-radius-md)', border: '1px solid var(--lg-stroke)', background: 'var(--lg-fill)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-apple)' }}
          ><Download size={15} aria-hidden="true" />{t('settings_exportBackup')}</button>
          <button
            onClick={() => { onImport(); onClose() }}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: 'var(--lg-radius-md)', border: '1px solid var(--lg-stroke)', background: 'var(--lg-fill)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-apple)' }}
          ><Upload size={15} aria-hidden="true" />{t('settings_importBackup')}</button>
        </div>
      </div>
    </Dialog>
  )
}

// ── 辅助区块组件 ─────────────────────────────────────────────────
function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>{desc}</div>
      {children}
    </div>
  )
}

function CardIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={20} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
}
