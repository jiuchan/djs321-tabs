import React from 'react'
import { Dialog } from './Dialog'
import { Download, Upload, X, type LucideIcon } from 'lucide-react'
import { Settings, GroupBy, ViewMode, Theme, NavSection, NavigationLayout } from '../../lib/settings'
import { GROUP_ICONS, SECTION_ICONS, THEME_ICONS, VIEW_ICONS } from '../../lib/choice-icons'

const LAYOUT_OPTIONS: { value: NavigationLayout; title: string; desc: string }[] = [
  { value: 'top', title: '顶部导航', desc: '横向工作台，内容空间更开阔' },
  { value: 'sidebar', title: '侧边导航', desc: '纵向快捷栏，入口始终在手边' },
  { value: 'classic', title: '经典右侧', desc: '居中大时钟，保留旧版宽松排布' },
]

// ── 选项数据 ──────────────────────────────────────────────────────
const GROUP_OPTIONS: { value: GroupBy; title: string; desc: string }[] = [
  { value: 'none',        title: '不分组',       desc: '所有标签平铺展示' },
  { value: 'domain',      title: '按域名',       desc: '相同网站的标签归为一组' },
  { value: 'chromeGroup', title: '浏览器分组', desc: '读取浏览器中的标签组' },
  { value: 'window',      title: '按窗口',       desc: '按浏览器窗口分栏展示' },
  { value: 'time',        title: '按时间',       desc: '按最近访问时间分层' },
  { value: 'category',    title: '内容分类',     desc: '智能识别：开发/视频/购物等' },
]

const VIEW_OPTIONS: { value: ViewMode; title: string; desc: string }[] = [
  { value: 'grid',   title: '网格卡片', desc: '带图标的小卡片，视觉直观' },
  { value: 'list',   title: '紧凑列表', desc: '单行紧凑展示，信息密度高' },
  { value: 'kanban', title: '看板',     desc: '每组一列横向排布' },
]

const THEME_OPTIONS: { value: Theme; title: string }[] = [
  { value: 'light', title: '白天模式' },
  { value: 'dark',  title: '夜间模式' },
]

const DEFAULT_SECTION_OPTIONS: { value: NavSection; title: string; desc: string }[] = [
  { value: 'tabs',       title: '标签', desc: '打开新标签页后先查看当前标签' },
  { value: 'quicklinks', title: '导航',   desc: '把新标签页作为常用导航工作台' },
  { value: 'bookmarks',  title: '书签',   desc: '默认进入书签空间，方便沉淀资料' },
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
    <Dialog label="设置" onClose={onClose} className="nt-settings-dialog">
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
            <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.3px' }}>设置</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>更改即时生效，并自动保存</div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭设置"
            style={{ display: 'inline-flex', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
          ><X size={20} aria-hidden="true" /></button>
        </div>

        <fieldset className="nt-layout-settings">
          <legend>导航布局</legend>
          <p id="navigation-layout-hint">小窗口自动使用顶部导航，不会改变你的选择。</p>
          <div className="nt-layout-choices">
            {LAYOUT_OPTIONS.map(o => (
              <label className="nt-layout-choice" key={o.value}>
                <input
                  className="nt-layout-input"
                  type="radio"
                  name="navigationLayout"
                  value={o.value}
                  checked={settings.navigationLayout === o.value}
                  aria-label={o.title}
                  aria-describedby="navigation-layout-hint"
                  onChange={() => onSettingChange('navigationLayout', o.value)}
                />
                <span className="nt-layout-card">
                  <span className={`nt-layout-preview ${o.value}`} aria-hidden="true">
                    <span className="nt-layout-preview-nav"><i /><i /><i /></span>
                    <span className="nt-layout-preview-content"><i /><i /><i /></span>
                  </span>
                  <span className="nt-layout-choice-title">{o.title}<span className="nt-layout-check" aria-hidden="true">✓</span></span>
                  <span className="nt-layout-choice-desc">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── 分组方式 ── */}
        <Section title="标签分组方式" desc="选择新标签页如何对打开的标签进行分组">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {GROUP_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('groupBy', o.value)}
                style={{ ...CARD_BASE, ...(settings.groupBy === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={GROUP_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.desc}</span>
                {settings.groupBy === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── 视图模式 ── */}
        <Section title="展示视图" desc="选择标签的展现形式">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {VIEW_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('viewMode', o.value)}
                style={{ ...CARD_BASE, ...(settings.viewMode === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={VIEW_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.desc}</span>
                {settings.viewMode === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title="默认入口" desc="设置打开新标签页时默认展示的主区域">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {DEFAULT_SECTION_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('defaultSection', o.value)}
                style={{ ...CARD_BASE, ...(settings.defaultSection === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={SECTION_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{o.desc}</span>
                {settings.defaultSection === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* ── 外观主题 ── */}
        <Section title="外观主题" desc="切换新标签页的明暗模式">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {THEME_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => onSettingChange('theme', o.value)}
                style={{ ...CARD_BASE, ...(settings.theme === o.value ? CARD_SELECTED : {}) }}
              >
                <CardIcon icon={THEME_ICONS[o.value]} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>{o.title}</span>
                {settings.theme === o.value && (
                  <span style={{ position: 'absolute', insetBlockStart: '10px', insetInlineEnd: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </Section>

        <Section title="联网与隐私" desc="本地管理无需账号。联网功能由你选择启用。">
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={settings.enableRemoteQuotes} onChange={e => onSettingChange('enableRemoteQuotes', e.target.checked)} />
            <span>启用每日一言（向一言服务发送网络请求）</span>
          </label>
          <p style={{ fontSize: 12, lineHeight: 1.6 }}>在线壁纸和网站图标会向相应网站联网；收集正文只在点击时执行，发送目标以完整设置页为准。</p>
          <button type="button" onClick={() => { void chrome.runtime.openOptionsPage() }} style={{ ...CARD_BASE, padding: '10px 14px' }}>连接授权与隐私说明</button>
        </Section>

        {/* ── 数据管理 ── */}
        <div style={{ borderTop: '1px solid var(--lg-stroke-soft)', paddingTop: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { onExport(); onClose() }}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: 'var(--lg-radius-md)', border: '1px solid var(--lg-stroke)', background: 'var(--lg-fill)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-apple)' }}
          ><Download size={15} aria-hidden="true" />导出备份</button>
          <button
            onClick={() => { onImport(); onClose() }}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', borderRadius: 'var(--lg-radius-md)', border: '1px solid var(--lg-stroke)', background: 'var(--lg-fill)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-apple)' }}
          ><Upload size={15} aria-hidden="true" />导入备份</button>
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
