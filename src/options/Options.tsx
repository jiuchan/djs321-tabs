import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Settings, GroupBy, ViewMode, Theme, NavSection, DEFAULT_SETTINGS, loadSettings, saveSetting, normalizeNavigationLayout, normalizeApiUrl } from '../lib/settings'
import { requestCaptureAccess, revokeOptionalSiteAccess } from '../lib/site-access'
import { DESKTOP_ENDPOINT, createDesktopPairing, createDesktopReconnect, disconnectDesktop, hasPendingDesktopRevocation, isLocalDesktopEndpoint, loadDesktopConnectionSnapshot, pollDesktopPairing, prepareDesktopConnection, probeDesktopConnection, waitForDesktopConnection, type DesktopConnectionState } from '../lib/desktop-connection'
import { clearDesktopDiscovery } from '../lib/desktop-discovery'
import { brandName } from '../lib/brand'
import { GROUP_ICONS, SECTION_ICONS, THEME_ICONS, VIEW_ICONS } from '../lib/choice-icons'
import { ChoiceIcon } from './ChoiceIcon'

/* ───── 选项数据 ───── */
const GROUP_OPTIONS: { value: GroupBy; title: string; desc: string }[] = [
  { value: 'none',        title: '不分组',        desc: '所有标签平铺展示，适合标签少的场景' },
  { value: 'domain',      title: '按域名',        desc: '相同网站的标签归为一组，最常用的分组方式' },
  { value: 'chromeGroup', title: '浏览器分组',  desc: '读取你在浏览器中手动创建的标签组，零额外操作' },
  { value: 'window',      title: '按窗口',        desc: '多窗口用户必备，按浏览器窗口分栏展示' },
  { value: 'time',        title: '按时间',        desc: '按最近访问时间分层：刚刚 / 今天 / 昨天 / 更早' },
  { value: 'category',    title: '内容分类',      desc: '智能识别：开发 / 视频 / 购物 / 社交 / 音乐等' },
]

const VIEW_OPTIONS: { value: ViewMode; title: string; desc: string }[] = [
  { value: 'grid',   title: '网格卡片', desc: '带图标的小卡片，视觉直观，适合中等数量的标签' },
  { value: 'list',   title: '紧凑列表', desc: '单行紧凑展示，信息密度最高，适合标签数量多的场景' },
  { value: 'kanban', title: '看板',     desc: '每组一列横向排布，适合少分组时的全局纵览' },
]

const THEME_OPTIONS: { value: Theme; title: string }[] = [
  { value: 'light', title: '白天模式' },
  { value: 'dark',  title: '夜间模式' },
]

const DEFAULT_SECTION_OPTIONS: { value: NavSection; title: string; desc: string }[] = [
  { value: 'tabs',       title: '标签页', desc: '默认查看当前打开的标签' },
  { value: 'quicklinks', title: '导航',   desc: '默认进入常用导航页' },
  { value: 'bookmarks',  title: '书签',   desc: '默认进入书签空间' },
]

export default function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [apiDraft, setApiDraft] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('')
  const [privacyStatus, setPrivacyStatus] = useState('')
  const [savingConnection, setSavingConnection] = useState(false)
  const [desktopState, setDesktopState] = useState<DesktopConnectionState | 'pairing' | 'checking' | 'error'>('checking')
  const [pairingLink, setPairingLink] = useState(createDesktopPairing)
  const [reconnectLink, setReconnectLink] = useState(createDesktopReconnect)
  const [launchReady, setLaunchReady] = useState(false)
  const [busy, setBusy] = useState(true)
  const [hasCredential, setHasCredential] = useState(false)
  const [pendingRevocation, setPendingRevocation] = useState(false)
  const [ready, setReady] = useState(false)
  const mounted = useRef(false)
  const work = useRef<AbortController | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const launchInFlight = useRef<string | null>(null)
  const registration = useRef({ generation: 0, nonce: '' })
  const busyRef = useRef(busy)
  busyRef.current = busy
  const primaryOpen = pendingRevocation || desktopState === 'connected' || ((desktopState === 'not-running' || desktopState === 'checking' || desktopState === 'error') && hasCredential)

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    work.current = controller
    void loadSettings().then(loaded => {
      if (!controller.signal.aborted) { setSettings(loaded); setApiDraft(isLocalDesktopEndpoint(loaded.justdoitApiUrl) ? '' : loaded.justdoitApiUrl); setReady(true) }
    }).catch(() => {
      if (!controller.signal.aborted) { setDesktopState('error'); setConnectionStatus('设置读取失败，请重新打开插件设置。') }
    })
    void loadDesktopConnectionSnapshot(controller.signal).then(snapshot => {
      if (!controller.signal.aborted) {
        setDesktopState(snapshot.state); setHasCredential(snapshot.hasCredential)
        setPendingRevocation(snapshot.pendingRevocation); setConnectionStatus(snapshot.message)
      }
    }).catch(error => {
      if (!controller.signal.aborted) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : '连接检查失败。') }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => {
      mounted.current = false
      controller.abort()
      work.current?.abort()
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  useEffect(() => {
    setLaunchReady(false)
    if (!ready) return
    const mode = primaryOpen ? 'connect' : 'pair'
    const link = mode === 'connect' ? reconnectLink : pairingLink
    const generation = registration.current.generation + 1
    registration.current = { generation, nonce: link.nonce }
    let disposed = false
    const clearUnused = () => {
      const current = registration.current
      if (launchInFlight.current !== link.nonce && (current.generation === generation || current.nonce !== link.nonce)) {
        void clearDesktopDiscovery(link).catch(() => undefined)
      }
    }
    void prepareDesktopConnection(link, mode).then(() => {
      if (disposed) { clearUnused(); return }
      setLaunchReady(true)
    }).catch(error => {
      if (!disposed) setConnectionStatus(error instanceof Error ? error.message : '本机发现准备失败，请重试。')
    })
    const refresh = setInterval(() => {
      if (busyRef.current) return
      setLaunchReady(false)
      if (mode === 'connect') setReconnectLink(createDesktopReconnect())
      else setPairingLink(createDesktopPairing())
    }, 60_000)
    return () => {
      disposed = true
      clearInterval(refresh)
      // StrictMode may immediately register the same nonce again; never clear its newer setup.
      queueMicrotask(clearUnused)
    }
  }, [ready, primaryOpen, pairingLink, reconnectLink])

  function beginWork() {
    work.current?.abort()
    const controller = new AbortController()
    work.current = controller
    return controller
  }

  function isCurrent(controller: AbortController) {
    return mounted.current && work.current === controller && !controller.signal.aborted
  }

  function refreshConnection() {
    const controller = beginWork()
    setBusy(true)
    setDesktopState('checking')
    setConnectionStatus('')
    void probeDesktopConnection(controller.signal).then(state => {
      if (isCurrent(controller)) setDesktopState(state)
    }).catch(error => {
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : '连接检查失败。') }
    }).finally(() => { if (isCurrent(controller)) setBusy(false) })
  }

  function openDesktopApp(event: MouseEvent<HTMLAnchorElement>) {
    if (desktopState === 'pairing') return
    if (!hasCredential && !pendingRevocation) return
    if (!ready || busy || savingConnection || !launchReady) { event.preventDefault(); return }
    const controller = beginWork()
    launchInFlight.current = reconnectLink.nonce
    setBusy(true)
    setDesktopState('checking')
    setConnectionStatus('正在等待 App 回传当前端口，最多 20 秒。请在装有此插件的默认浏览器中完成握手。')
    void prepareDesktopConnection(reconnectLink, 'connect').then(() => waitForDesktopConnection({ discovery: reconnectLink, signal: controller.signal })).then(state => {
      if (!isCurrent(controller)) return
      setDesktopState(state)
      setConnectionStatus(state === 'not-running' ? '握手尚未完成。请确认已安装新版 App，且本机握手页打开在装有此插件的浏览器资料中，再重试。' : '')
    }).catch(error => {
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : '连接检查失败。') }
    }).finally(() => {
      void clearDesktopDiscovery(reconnectLink).catch(() => undefined)
      if (launchInFlight.current === reconnectLink.nonce) launchInFlight.current = null
      if (isCurrent(controller)) { setBusy(false); setLaunchReady(false); setReconnectLink(createDesktopReconnect()) }
    })
  }

  // Let the anchor navigate synchronously in the original click, before any await.
  function startPairing(event: MouseEvent<HTMLAnchorElement>) {
    if (!ready || busy || savingConnection || !launchReady) { event.preventDefault(); return }
    const controller = beginWork()
    launchInFlight.current = pairingLink.nonce
    setDesktopState('pairing')
    setBusy(true)
    setConnectionStatus('请在桌面 App 核对配对码并批准。不会自动发送标签或正文。')
    void prepareDesktopConnection(pairingLink, 'pair').then(() => pollDesktopPairing(pairingLink, { signal: controller.signal })).then(async () => {
      if (!isCurrent(controller)) return
      setHasCredential(true)
      setPendingRevocation(false)
      setDesktopState('connected')
      await update('justdoitApiUrl', DESKTOP_ENDPOINT)
      if (!isCurrent(controller)) return
      setApiDraft('')
      setConnectionStatus('配对完成，发送地址已设为本机。只有点击发送时才会收集并发送所选内容。')
    }).catch(error => {
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : '配对未完成，请重试。') }
    }).finally(() => {
      void clearDesktopDiscovery(pairingLink).catch(() => undefined)
      if (launchInFlight.current === pairingLink.nonce) launchInFlight.current = null
      if (isCurrent(controller)) { setBusy(false); setLaunchReady(false); setPairingLink(createDesktopPairing()) }
    })
  }

  function cancelPairing() {
    work.current?.abort()
    setLaunchReady(false)
    setBusy(false)
    setDesktopState('unpaired')
    setPairingLink(createDesktopPairing())
    setConnectionStatus('已取消配对，未发送任何内容。')
  }

  function disconnect() {
    const controller = beginWork()
    setBusy(true)
    void disconnectDesktop(controller.signal).then(() => {
      if (isCurrent(controller)) { setHasCredential(false); setPendingRevocation(false); setDesktopState('unpaired'); setConnectionStatus('已断开并清除本机配对。') }
    }).catch(async error => {
      const pending = await hasPendingDesktopRevocation().catch(() => false)
      if (isCurrent(controller)) { setHasCredential(false); setPendingRevocation(pending); setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : '断开未完成，请重试。') }
    }).finally(() => { if (isCurrent(controller)) setBusy(false) })
  }

  async function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    await saveSetting(key, value)
    if (!mounted.current) return
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1800)
  }

  async function saveConnection() {
    if (!ready || busy || savingConnection) return
    const raw = apiDraft.trim().replace(/\/+$/, '')
    const normalized = normalizeApiUrl(raw)
    if (raw && (normalized !== raw || !raw.startsWith('https://') || isLocalDesktopEndpoint(normalized))) {
      setConnectionStatus('高级地址仅支持自定义 HTTPS；本机端口由 App 自动回传，请留空恢复本机模式。地址不能包含账号密码、查询参数或片段。')
      return
    }
    try {
      const access = raw ? requestCaptureAccess([normalized]) : Promise.resolve()
      setSavingConnection(true)
      await access
      if (!mounted.current) return
      await update('justdoitApiUrl', normalized)
      if (!mounted.current) return
      setApiDraft(raw ? normalized : '')
      setConnectionStatus(raw ? '连接地址已保存。只有点击发送时，标题、网址及所选正文才会发送到此地址。' : '已恢复自动本机连接；实际端口来自已配对 App，不需要填写地址。')
    } catch (error) {
      if (mounted.current) setConnectionStatus(error instanceof Error ? error.message : '授权或保存未完成。')
    } finally {
      if (mounted.current) setSavingConnection(false)
    }
  }

  return (
    <div className={`opt-root ${settings.theme}`}>
      {/* Header */}
      <div className="opt-header">
        <div className="opt-logo">
          <img src="/icons/icon.svg" alt="" width={28} height={28} />
          <span>{brandName()}</span>
        </div>
        <div className="opt-version">v{chrome.runtime.getManifest().version} · 设置</div>
        <div className={`opt-saved ${saved ? 'show' : ''}`}>✓ 已保存</div>
      </div>

      <div className="opt-body">
        <section className="opt-section">
          <h2 className="opt-section-title"><label htmlFor="navigation-layout">导航布局</label></h2>
          <p className="opt-section-desc" id="navigation-layout-hint">小窗口自动使用顶部导航，不会改变已保存的选择。</p>
          <select
            id="navigation-layout"
            aria-describedby="navigation-layout-hint"
            value={settings.navigationLayout}
            onChange={e => update('navigationLayout', normalizeNavigationLayout(e.target.value))}
            style={{ inlineSize: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--lg-stroke)', background: 'var(--bg-card-solid)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14 }}
          >
            <option value="top">顶部导航</option>
            <option value="sidebar">侧边导航</option>
            <option value="classic">经典右侧 · 居中大时钟</option>
          </select>
        </section>

        {/* ─── 分组方式 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">标签分组方式</h2>
          <p className="opt-section-desc">选择新标签页如何对打开的标签进行分组</p>
          <div className="opt-cards-grid">
            {GROUP_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.groupBy === o.value ? 'selected' : ''}`}
                onClick={() => update('groupBy', o.value)}
              >
                <ChoiceIcon icon={GROUP_ICONS[o.value]} />
                <span className="opt-card-title">{o.title}</span>
                <span className="opt-card-desc">{o.desc}</span>
                {settings.groupBy === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 视图模式 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">展示视图</h2>
          <p className="opt-section-desc">选择标签的展现形式</p>
          <div className="opt-cards-grid opt-cards-3col">
            {VIEW_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.viewMode === o.value ? 'selected' : ''}`}
                onClick={() => update('viewMode', o.value)}
              >
                <ChoiceIcon icon={VIEW_ICONS[o.value]} />
                <span className="opt-card-title">{o.title}</span>
                <span className="opt-card-desc">{o.desc}</span>
                {settings.viewMode === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="opt-section">
          <h2 className="opt-section-title">默认入口</h2>
          <p className="opt-section-desc">选择打开新标签页时默认先进入的主区域</p>
          <div className="opt-cards-grid opt-cards-3col">
            {DEFAULT_SECTION_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.defaultSection === o.value ? 'selected' : ''}`}
                onClick={() => update('defaultSection', o.value)}
              >
                <ChoiceIcon icon={SECTION_ICONS[o.value]} />
                <span className="opt-card-title">{o.title}</span>
                <span className="opt-card-desc">{o.desc}</span>
                {settings.defaultSection === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 主题 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">外观主题</h2>
          <p className="opt-section-desc">切换新标签页的明暗模式</p>
          <div className="opt-cards-grid opt-cards-2col">
            {THEME_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.theme === o.value ? 'selected' : ''}`}
                onClick={() => update('theme', o.value)}
              >
                <ChoiceIcon icon={THEME_ICONS[o.value]} />
                <span className="opt-card-title">{o.title}</span>
                {settings.theme === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 倒计时321 连接 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">倒计时321 连接</h2>
          <p className="opt-section-desc">点击连接，在 App 中批准后自动使用 App 的实际端口。身份与配对信息仅保存在当前浏览器，不进入同步或备份，不会自动发送内容。</p>
          <p className="opt-section-desc">App 会在系统默认浏览器打开本机握手页。请使用装有此插件的浏览器资料；打开到其他浏览器或资料时，回到这里重试，不需要填写端口。</p>
          <p className="opt-connection-state" role="status" aria-live="polite">
            {!ready && desktopState !== 'error' ? '正在读取设置' : {
              'checking': '正在检查本机桌面 App 连接…',
              'not-running': 'App 未响应或端口已变化，请打开 App 重新连接。',
              'unpaired': '尚未配对，请点击连接并在 App 中批准。',
              'connected': '本机桌面 App 已连接',
              'revoked': '配对授权已撤销，请重新连接。',
              'pairing': '正在配对，请在 App 中核对配对码。',
              'error': '连接未完成，请按下方提示重试。',
            }[desktopState]}
          </p>
          {desktopState === 'pairing' && <p className="opt-pairing-code">配对码 <strong>{pairingLink.code}</strong><span>三分钟内有效；拒绝或取消不会发送内容。</span></p>}
          <div className="opt-connection-actions">
            {desktopState !== 'pairing' && (primaryOpen
              ? <a className="opt-card opt-connection-action opt-connection-primary" href={reconnectLink.url} onClick={openDesktopApp} aria-disabled={!ready || busy || savingConnection || !launchReady}>打开 App / 重新连接</a>
              : <a className="opt-card opt-connection-action opt-connection-primary" href={pairingLink.url} onClick={startPairing} aria-disabled={!ready || busy || savingConnection || !launchReady}>连接桌面 App</a>)}
            {!primaryOpen && <a className="opt-connection-action opt-connection-secondary" href="djs321-desktop://open" onClick={event => {
              if (desktopState !== 'pairing' && (!ready || busy || savingConnection)) { event.preventDefault(); return }
              if (desktopState !== 'pairing') setConnectionStatus('仅唤醒 App；请点击连接，并在 App 中批准配对。')
            }} aria-disabled={desktopState !== 'pairing' && (!ready || busy || savingConnection)}>打开桌面 App</a>}
            {desktopState === 'pairing'
              ? <button type="button" className="opt-card opt-connection-action" onClick={cancelPairing}>取消配对</button>
              : <button type="button" className="opt-connection-action opt-connection-secondary" disabled={!ready || busy || savingConnection} onClick={refreshConnection}>检查连接</button>}
            {(hasCredential || pendingRevocation) && <button type="button" className="opt-connection-action opt-connection-secondary" disabled={!ready || busy || savingConnection} onClick={disconnect}>{pendingRevocation ? '断开（完成撤销）' : '断开配对'}</button>}
          </div>
          {settings.justdoitApiUrl !== DESKTOP_ENDPOINT && <p className="opt-section-desc">当前发送地址：{settings.justdoitApiUrl}。连接桌面 App 完成后将切回本机地址；自定义 HTTPS 可在高级设置中保留或重新选择。</p>}
          <p role="status" aria-live="polite" className="opt-section-desc">{connectionStatus}</p>
          <details className="opt-connection-advanced">
            <summary>高级连接设置</summary>
            <p className="opt-section-desc">本机地址自动发现并核验，不支持手动猜测端口或旧版无认证发送。下面留空并保存可恢复本机模式。自定义 HTTPS 保留原有接口格式；保存时按此网站请求授权，远程服务将收到你主动发送的标题、网址和正文。</p>
            <input
              type="text"
              aria-label="倒计时321连接地址"
              value={apiDraft}
              onChange={e => setApiDraft(e.target.value)}
              placeholder="https://your-service.example（留空使用本机）"
              spellCheck={false}
              disabled={!ready || busy || savingConnection}
              className="opt-connection-input"
            />
            <button type="button" className="opt-card opt-connection-action" disabled={!ready || busy || savingConnection} onClick={() => { void saveConnection() }} style={{ marginBlockStart: 12 }}>保存并授权此地址</button>
          </details>
        </section>

        <section className="opt-section">
          <h2 className="opt-section-title">联网与隐私</h2>
          <p className="opt-section-desc">在线壁纸和网站图标会向相应网站联网。正文只在点击收集时提取；批量收集仅按所选网页的网站授权。不向开发者发送你的标签、书签或正文。</p>
          <label className="opt-toggle-row">
            <span className="opt-toggle-text">
              <span className="opt-toggle-title">每日一言</span>
              <span className="opt-toggle-desc">默认关闭；开启后新标签页会向一言服务联网获取短句。</span>
            </span>
            <input type="checkbox" role="switch" className="opt-switch" checked={settings.enableRemoteQuotes} onChange={e => { void update('enableRemoteQuotes', e.target.checked) }} />
          </label>
          <div className="opt-connection-actions">
            <button type="button" className="opt-card opt-connection-action" onClick={() => {
              void revokeOptionalSiteAccess().then(() => { if (mounted.current) setPrivacyStatus('已撤销可选网站授权。再次收集或使用自定义连接时需要重新授权。') }).catch(() => { if (mounted.current) setPrivacyStatus('撤销未完成，请在浏览器扩展设置中检查。') })
            }}>撤销可选网站授权</button>
            <a className="opt-connection-action opt-connection-secondary" href={chrome.runtime.getURL('privacy.html')} target="_blank" rel="noreferrer">插件隐私说明</a>
          </div>
          <p role="status" aria-live="polite" className="opt-section-desc">{privacyStatus}</p>
        </section>
      </div>

      <div className="opt-footer">设置即时生效，刷新新标签页后可见</div>
    </div>
  )
}
