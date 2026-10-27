import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Settings, GroupBy, ViewMode, Theme, NavSection, DEFAULT_SETTINGS, loadSettings, saveSetting, normalizeNavigationLayout, normalizeApiUrl } from '../lib/settings'
import { requestCaptureAccess, revokeOptionalSiteAccess } from '../lib/site-access'
import { DESKTOP_ENDPOINT, createDesktopPairing, createDesktopReconnect, disconnectDesktop, hasPendingDesktopRevocation, isLocalDesktopEndpoint, loadDesktopConnectionSnapshot, pollDesktopPairing, prepareDesktopConnection, probeDesktopConnection, waitForDesktopConnection, type DesktopConnectionState } from '../lib/desktop-connection'
import { clearDesktopDiscovery } from '../lib/desktop-discovery'
import { brandName } from '../lib/brand'
import { t, type MessageKey } from '../lib/i18n'
import { GROUP_ICONS, SECTION_ICONS, THEME_ICONS, VIEW_ICONS } from '../lib/choice-icons'
import { ChoiceIcon } from './ChoiceIcon'

/* ───── 选项数据 ───── */
const GROUP_OPTIONS: { value: GroupBy; title: MessageKey; desc: MessageKey }[] = [
  { value: 'none',        title: 'settings_groupNone',        desc: 'options_groupNoneDesc' },
  { value: 'domain',      title: 'settings_groupDomain',      desc: 'options_groupDomainDesc' },
  { value: 'chromeGroup', title: 'settings_groupChromeGroup', desc: 'options_groupChromeGroupDesc' },
  { value: 'window',      title: 'settings_groupWindow',      desc: 'options_groupWindowDesc' },
  { value: 'time',        title: 'settings_groupTime',        desc: 'options_groupTimeDesc' },
  { value: 'category',    title: 'settings_groupCategory',    desc: 'options_groupCategoryDesc' },
]

const VIEW_OPTIONS: { value: ViewMode; title: MessageKey; desc: MessageKey }[] = [
  { value: 'grid',   title: 'settings_viewGrid',   desc: 'options_viewGridDesc' },
  { value: 'list',   title: 'settings_viewList',   desc: 'options_viewListDesc' },
  { value: 'kanban', title: 'settings_viewKanban', desc: 'options_viewKanbanDesc' },
]

const THEME_OPTIONS: { value: Theme; title: MessageKey }[] = [
  { value: 'light', title: 'settings_themeLight' },
  { value: 'dark',  title: 'settings_themeDark' },
]

const DEFAULT_SECTION_OPTIONS: { value: NavSection; title: MessageKey; desc: MessageKey }[] = [
  { value: 'tabs',       title: 'options_sectionTabs',        desc: 'options_sectionTabsDesc' },
  { value: 'quicklinks', title: 'settings_sectionQuicklinks', desc: 'options_sectionQuicklinksDesc' },
  { value: 'bookmarks',  title: 'settings_sectionBookmarks',  desc: 'options_sectionBookmarksDesc' },
]

const DESKTOP_STATE_LABELS: Record<DesktopConnectionState | 'pairing' | 'checking' | 'error', MessageKey> = {
  'checking': 'options_stateChecking',
  'not-running': 'options_stateNotRunning',
  'unpaired': 'options_stateUnpaired',
  'connected': 'options_stateConnected',
  'revoked': 'options_stateRevoked',
  'pairing': 'options_statePairing',
  'error': 'options_stateError',
}

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
      if (!controller.signal.aborted) { setDesktopState('error'); setConnectionStatus(t('options_msgSettingsLoadFailed')) }
    })
    void loadDesktopConnectionSnapshot(controller.signal).then(snapshot => {
      if (!controller.signal.aborted) {
        setDesktopState(snapshot.state); setHasCredential(snapshot.hasCredential)
        setPendingRevocation(snapshot.pendingRevocation); setConnectionStatus(snapshot.message)
      }
    }).catch(error => {
      if (!controller.signal.aborted) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : t('options_msgCheckFailed')) }
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
      if (!disposed) setConnectionStatus(error instanceof Error ? error.message : t('options_msgDiscoveryFailed'))
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
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : t('options_msgCheckFailed')) }
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
    setConnectionStatus(t('options_msgWaitingHandshake'))
    void prepareDesktopConnection(reconnectLink, 'connect').then(() => waitForDesktopConnection({ discovery: reconnectLink, signal: controller.signal })).then(state => {
      if (!isCurrent(controller)) return
      setDesktopState(state)
      setConnectionStatus(state === 'not-running' ? t('options_msgHandshakeIncomplete') : '')
    }).catch(error => {
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : t('options_msgCheckFailed')) }
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
    setConnectionStatus(t('options_msgPairingApprove'))
    void prepareDesktopConnection(pairingLink, 'pair').then(() => pollDesktopPairing(pairingLink, { signal: controller.signal })).then(async () => {
      if (!isCurrent(controller)) return
      setHasCredential(true)
      setPendingRevocation(false)
      setDesktopState('connected')
      await update('justdoitApiUrl', DESKTOP_ENDPOINT)
      if (!isCurrent(controller)) return
      setApiDraft('')
      setConnectionStatus(t('options_msgPairingDone'))
    }).catch(error => {
      if (isCurrent(controller)) { setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : t('options_msgPairingFailed')) }
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
    setConnectionStatus(t('options_msgPairingCancelled'))
  }

  function disconnect() {
    const controller = beginWork()
    setBusy(true)
    void disconnectDesktop(controller.signal).then(() => {
      if (isCurrent(controller)) { setHasCredential(false); setPendingRevocation(false); setDesktopState('unpaired'); setConnectionStatus(t('options_msgDisconnected')) }
    }).catch(async error => {
      const pending = await hasPendingDesktopRevocation().catch(() => false)
      if (isCurrent(controller)) { setHasCredential(false); setPendingRevocation(pending); setDesktopState('error'); setConnectionStatus(error instanceof Error ? error.message : t('options_msgDisconnectFailed')) }
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
      setConnectionStatus(t('options_msgInvalidUrl'))
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
      setConnectionStatus(raw ? t('options_msgUrlSaved') : t('options_msgLocalRestored'))
    } catch (error) {
      if (mounted.current) setConnectionStatus(error instanceof Error ? error.message : t('options_msgSaveFailed'))
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
        <div className="opt-version">v{chrome.runtime.getManifest().version} · {t('settings_title')}</div>
        <div className={`opt-saved ${saved ? 'show' : ''}`}>{t('options_saved')}</div>
      </div>

      <div className="opt-body">
        <section className="opt-section">
          <h2 className="opt-section-title"><label htmlFor="navigation-layout">{t('settings_navLayout')}</label></h2>
          <p className="opt-section-desc" id="navigation-layout-hint">{t('options_navLayoutHint')}</p>
          <select
            id="navigation-layout"
            aria-describedby="navigation-layout-hint"
            value={settings.navigationLayout}
            onChange={e => update('navigationLayout', normalizeNavigationLayout(e.target.value))}
            style={{ inlineSize: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--lg-stroke)', background: 'var(--bg-card-solid)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14 }}
          >
            <option value="top">{t('settings_layoutTop')}</option>
            <option value="sidebar">{t('settings_layoutSidebar')}</option>
            <option value="classic">{t('options_layoutClassic')}</option>
          </select>
        </section>

        {/* ─── 分组方式 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">{t('settings_groupByTitle')}</h2>
          <p className="opt-section-desc">{t('settings_groupByDesc')}</p>
          <div className="opt-cards-grid">
            {GROUP_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.groupBy === o.value ? 'selected' : ''}`}
                onClick={() => update('groupBy', o.value)}
              >
                <ChoiceIcon icon={GROUP_ICONS[o.value]} />
                <span className="opt-card-title">{t(o.title)}</span>
                <span className="opt-card-desc">{t(o.desc)}</span>
                {settings.groupBy === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 视图模式 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">{t('settings_viewTitle')}</h2>
          <p className="opt-section-desc">{t('settings_viewDesc')}</p>
          <div className="opt-cards-grid opt-cards-3col">
            {VIEW_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.viewMode === o.value ? 'selected' : ''}`}
                onClick={() => update('viewMode', o.value)}
              >
                <ChoiceIcon icon={VIEW_ICONS[o.value]} />
                <span className="opt-card-title">{t(o.title)}</span>
                <span className="opt-card-desc">{t(o.desc)}</span>
                {settings.viewMode === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="opt-section">
          <h2 className="opt-section-title">{t('settings_defaultSectionTitle')}</h2>
          <p className="opt-section-desc">{t('options_defaultSectionDesc')}</p>
          <div className="opt-cards-grid opt-cards-3col">
            {DEFAULT_SECTION_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.defaultSection === o.value ? 'selected' : ''}`}
                onClick={() => update('defaultSection', o.value)}
              >
                <ChoiceIcon icon={SECTION_ICONS[o.value]} />
                <span className="opt-card-title">{t(o.title)}</span>
                <span className="opt-card-desc">{t(o.desc)}</span>
                {settings.defaultSection === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 主题 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">{t('settings_themeTitle')}</h2>
          <p className="opt-section-desc">{t('settings_themeDesc')}</p>
          <div className="opt-cards-grid opt-cards-2col">
            {THEME_OPTIONS.map(o => (
              <button
                key={o.value}
                className={`opt-card ${settings.theme === o.value ? 'selected' : ''}`}
                onClick={() => update('theme', o.value)}
              >
                <ChoiceIcon icon={THEME_ICONS[o.value]} />
                <span className="opt-card-title">{t(o.title)}</span>
                {settings.theme === o.value && <span className="opt-card-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 倒计时321 连接 ─── */}
        <section className="opt-section">
          <h2 className="opt-section-title">{t('options_connTitle')}</h2>
          <p className="opt-section-desc">{t('options_connDesc')}</p>
          <p className="opt-section-desc">{t('options_connBrowserHint')}</p>
          <p className="opt-connection-state" role="status" aria-live="polite">
            {t(!ready && desktopState !== 'error' ? 'options_stateLoading' : DESKTOP_STATE_LABELS[desktopState])}
          </p>
          {desktopState === 'pairing' && <p className="opt-pairing-code">{t('options_pairingCode')} <strong>{pairingLink.code}</strong><span>{t('options_pairingCodeHint')}</span></p>}
          <div className="opt-connection-actions">
            {desktopState !== 'pairing' && (primaryOpen
              ? <a className="opt-card opt-connection-action opt-connection-primary" href={reconnectLink.url} onClick={openDesktopApp} aria-disabled={!ready || busy || savingConnection || !launchReady}>{t('options_openAppReconnect')}</a>
              : <a className="opt-card opt-connection-action opt-connection-primary" href={pairingLink.url} onClick={startPairing} aria-disabled={!ready || busy || savingConnection || !launchReady}>{t('options_connectDesktop')}</a>)}
            {!primaryOpen && <a className="opt-connection-action opt-connection-secondary" href="djs321-desktop://open" onClick={event => {
              if (desktopState !== 'pairing' && (!ready || busy || savingConnection)) { event.preventDefault(); return }
              if (desktopState !== 'pairing') setConnectionStatus(t('options_msgWakeOnly'))
            }} aria-disabled={desktopState !== 'pairing' && (!ready || busy || savingConnection)}>{t('options_openDesktop')}</a>}
            {desktopState === 'pairing'
              ? <button type="button" className="opt-card opt-connection-action" onClick={cancelPairing}>{t('options_cancelPairing')}</button>
              : <button type="button" className="opt-connection-action opt-connection-secondary" disabled={!ready || busy || savingConnection} onClick={refreshConnection}>{t('options_checkConnection')}</button>}
            {(hasCredential || pendingRevocation) && <button type="button" className="opt-connection-action opt-connection-secondary" disabled={!ready || busy || savingConnection} onClick={disconnect}>{t(pendingRevocation ? 'options_disconnectRevoke' : 'options_disconnect')}</button>}
          </div>
          {settings.justdoitApiUrl !== DESKTOP_ENDPOINT && <p className="opt-section-desc">{t('options_currentEndpoint', { url: settings.justdoitApiUrl })}</p>}
          <p role="status" aria-live="polite" className="opt-section-desc">{connectionStatus}</p>
          <details className="opt-connection-advanced">
            <summary>{t('options_advancedConnection')}</summary>
            <p className="opt-section-desc">{t('options_advancedDesc')}</p>
            <input
              type="text"
              aria-label={t('options_apiUrlLabel')}
              value={apiDraft}
              onChange={e => setApiDraft(e.target.value)}
              placeholder={t('options_apiUrlPlaceholder')}
              spellCheck={false}
              disabled={!ready || busy || savingConnection}
              className="opt-connection-input"
            />
            <button type="button" className="opt-card opt-connection-action" disabled={!ready || busy || savingConnection} onClick={() => { void saveConnection() }} style={{ marginBlockStart: 12 }}>{t('options_saveAuthorize')}</button>
          </details>
        </section>

        <section className="opt-section">
          <h2 className="opt-section-title">{t('settings_privacyTitle')}</h2>
          <p className="opt-section-desc">{t('options_privacyDesc')}</p>
          <label className="opt-toggle-row">
            <span className="opt-toggle-text">
              <span className="opt-toggle-title">{t('options_quotesTitle')}</span>
              <span className="opt-toggle-desc">{t('options_quotesDesc')}</span>
            </span>
            <input type="checkbox" role="switch" className="opt-switch" checked={settings.enableRemoteQuotes} onChange={e => { void update('enableRemoteQuotes', e.target.checked) }} />
          </label>
          <div className="opt-connection-actions">
            <button type="button" className="opt-card opt-connection-action" onClick={() => {
              void revokeOptionalSiteAccess().then(() => { if (mounted.current) setPrivacyStatus(t('options_msgRevokeDone')) }).catch(() => { if (mounted.current) setPrivacyStatus(t('options_msgRevokeFailed')) })
            }}>{t('options_revokeAccess')}</button>
            <a className="opt-connection-action opt-connection-secondary" href={chrome.runtime.getURL('privacy.html')} target="_blank" rel="noreferrer">{t('options_privacyPolicy')}</a>
          </div>
          <p role="status" aria-live="polite" className="opt-section-desc">{privacyStatus}</p>
        </section>
      </div>

      <div className="opt-footer">{t('options_footer')}</div>
    </div>
  )
}
