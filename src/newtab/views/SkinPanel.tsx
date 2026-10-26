import { useState, useRef, useEffect, useCallback } from 'react'
import { Dices, FolderOpen, Globe, Image, Palette, Pencil, X } from 'lucide-react'
import { Settings } from '../../lib/settings'

/* ── 预设壁纸 ─────────────────────────────────────────────────── */
const PRESET_WALLPAPERS = [
  { id: 'none',      label: '无壁纸',   thumb: '',  url: '' },
  { id: 'mountains', label: '山川云海', thumb: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&q=60', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80' },
  { id: 'forest',    label: '林间晨光', thumb: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=200&q=60', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80' },
  { id: 'ocean',     label: '碧海蓝天', thumb: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=200&q=60', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80' },
  { id: 'aurora',    label: '极光夜空', thumb: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=200&q=60', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80' },
  { id: 'sakura',    label: '樱花烂漫', thumb: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=200&q=60', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&q=80' },
  { id: 'galaxy',    label: '星河璀璨', thumb: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=200&q=60', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80' },
  { id: 'desert',    label: '沙漠金沙', thumb: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=200&q=60', url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80' },
  { id: 'snow',      label: '雪景静谧', thumb: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=200&q=60', url: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=1920&q=80' },
]

/* ── 主题分类（Unsplash 关键词） ─────────────────────────────── */
const THEMES = [
  { id: 'nature',      label: '自然',   kw: 'nature' },
  { id: 'city',        label: '城市',   kw: 'city+night' },
  { id: 'mountain',    label: '山峰',   kw: 'mountain' },
  { id: 'ocean',       label: '海洋',   kw: 'ocean' },
  { id: 'space',       label: '宇宙',   kw: 'galaxy+space' },
  { id: 'minimal',     label: '极简',   kw: 'minimal+abstract' },
  { id: 'flower',      label: '花卉',   kw: 'flower' },
  { id: 'architecture',label: '建筑',   kw: 'architecture' },
  { id: 'animal',      label: '动物',   kw: 'wildlife' },
  { id: 'autumn',      label: '秋季',   kw: 'autumn+forest' },
]

interface PicsumPhoto { id: string; author: string; width: number; height: number; download_url: string }

/* ── Props ───────────────────────────────────────────────────── */
interface SkinPanelProps {
  settings: Settings
  onClose: () => void
  onSave: (key: 'wallpaper' | 'wallpaperBlur' | 'wallpaperDim', value: string | number) => void
}

/* ── Tab 类型 ─────────────────────────────────────────────────── */
type PanelTab = 'preset' | 'online' | 'custom'

export function SkinPanel({ settings, onClose, onSave }: SkinPanelProps) {
  const [activeTab, setActiveTab]       = useState<PanelTab>('preset')
  const [blur, setBlur]                 = useState(settings.wallpaperBlur)
  const [dim, setDim]                   = useState(settings.wallpaperDim)
  const [customUrl, setCustomUrl]       = useState('')
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  // 在线图库状态
  const [photos, setPhotos]             = useState<PicsumPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosPage, setPhotosPage]     = useState(1)
  const [selectedTheme, setSelectedTheme] = useState('')   // '' = Picsum 随机
  const [previewUrl, setPreviewUrl]     = useState('')     // hover 预览

  const txt    = 'var(--text-primary)'
  const sub    = 'var(--text-muted)'
  const bd     = 'var(--lg-stroke)'
  const bg2    = 'var(--lg-fill-thin)'

  /* 从 Picsum Photos 获取随机图片列表（免费，无需 API key） */
  const loadPicsumPhotos = useCallback(async (page: number) => {
    setLoadingPhotos(true)
    try {
      const res  = await fetch(`https://picsum.photos/v2/list?page=${page}&limit=15`)
      const data: PicsumPhoto[] = await res.json()
      setPhotos(data)
      setPhotosPage(page)
    } catch { /* 网络异常静默处理 */ }
    finally { setLoadingPhotos(false) }
  }, [])

  /* 切换到在线图库时自动加载 */
  useEffect(() => {
    if (activeTab === 'online' && photos.length === 0) loadPicsumPhotos(1)
  }, [activeTab])

  /* 主题分类：使用 Unsplash 搜索关键词 seed */
  const loadThemePhotos = async (kw: string, themeId: string) => {
    setSelectedTheme(themeId)
    setLoadingPhotos(true)
    setPhotos([])
    try {
      // 生成 15 个带 seed 的 Picsum 图片（按关键词哈希生成 seed）
      const seed = kw.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      const list: PicsumPhoto[] = Array.from({ length: 15 }, (_, i) => ({
        id: String(seed * 7 + i * 13),
        author: kw,
        width: 1920, height: 1080,
        download_url: `https://picsum.photos/seed/${kw}-${i}/1920/1080`,
      }))
      setPhotos(list)
    } finally { setLoadingPhotos(false) }
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 300,
    width: 'min(700px, 92vw)',
    maxHeight: '86vh',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-card-solid)',
    backdropFilter: 'blur(var(--lg-blur)) saturate(var(--lg-saturate))',
    WebkitBackdropFilter: 'blur(var(--lg-blur)) saturate(var(--lg-saturate))',
    borderRadius: 'var(--lg-radius-xl)',
    border: `1px solid ${bd}`,
    boxShadow: 'var(--lg-shadow-raised)',
    overflow: 'hidden',
    animation: 'skinPanelIn 0.22s cubic-bezier(0.16,1,0.3,1)',
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 18px', borderRadius: 'var(--lg-radius-sm)', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: 'var(--font-apple)',
    background: active ? 'var(--accent)' : bg2,
    color:      active ? 'var(--text-on-accent, #fff)' : sub,
    transition: 'all 0.18s',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2,
    color: sub, marginBottom: 10,
  }

  const sliderStyle: React.CSSProperties = {
    width: '100%', height: 4, appearance: 'none',
    background: 'var(--lg-fill-thin)',
    borderRadius: 2, outline: 'none', cursor: 'pointer',
  }

  const thumbUrl = (photo: PicsumPhoto) =>
    selectedTheme
      ? photo.download_url.replace('/1920/1080', '/300/170')
      : `https://picsum.photos/id/${photo.id}/300/170`

  const fullUrl = (photo: PicsumPhoto) =>
    selectedTheme ? photo.download_url : `https://picsum.photos/id/${photo.id}/1920/1080`

  return (
    <>
      {/* 遮罩 */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 299,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        animation: 'fadeIn 0.2s',
      }} />

      {/* 面板 */}
      <div style={panelStyle} onClick={e => e.stopPropagation()}>

        {/* ── 标题栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Palette size={20} aria-hidden="true" style={{ color: sub }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: txt }}>皮肤设置</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'inline-flex', color: sub, padding: '4px 8px', borderRadius: 8,
          }} aria-label="关闭皮肤设置"><X size={18} aria-hidden="true" /></button>
        </div>

        {/* ── Tab 切换 */}
        <div style={{
          display: 'flex', gap: 8, padding: '14px 22px 12px',
          borderBottom: `1px solid ${bd}`, flexShrink: 0,
        }}>
          <button style={tabBtnStyle(activeTab === 'preset')} onClick={() => setActiveTab('preset')}><Image size={14} aria-hidden="true" />预设</button>
          <button style={tabBtnStyle(activeTab === 'online')} onClick={() => setActiveTab('online')}><Globe size={14} aria-hidden="true" />在线图库</button>
          <button style={tabBtnStyle(activeTab === 'custom')} onClick={() => setActiveTab('custom')}><Pencil size={14} aria-hidden="true" />自定义</button>
        </div>

        {/* ── 内容区（可滚动） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 20px' }}>

          {/* ════ 预设 Tab ════ */}
          {activeTab === 'preset' && (
            <div>
              <div style={labelStyle}>预设壁纸 — 点击即用</div>
              {/* 3列布局，图片更大 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {PRESET_WALLPAPERS.map(p => {
                  const isActive = settings.wallpaper === p.url
                  return (
                    <button key={p.id} onClick={() => onSave('wallpaper', p.url)} title={p.label}
                      style={{
                        position: 'relative', width: '100%', padding: 0,
                        borderRadius: 12, cursor: 'pointer', overflow: 'hidden',
                        border: isActive ? '2.5px solid var(--accent)' : `1.5px solid ${bd}`,
                        background: 'transparent',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        transform: isActive ? 'scale(0.97)' : undefined,
                        boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)' :'0 2px 8px rgba(0,0,0,0.1)',
                        display: 'flex', flexDirection: 'column',
                      }}>
                      {/* 图片区域 */}
                      <div style={{
                        width: '100%', aspectRatio: '16/9',
                        background: p.url ? `url(${p.thumb}) center/cover` : bg2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {!p.url && <span style={{ fontSize: 22, opacity: 0.3 }}>∅</span>}
                        {isActive && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}>
                            <span style={{ fontSize: 18, filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.6))', color: '#fff' }}>✓</span>
                          </div>
                        )}
                      </div>
                      {/* 标签在图片下方 */}
                      <div style={{
                        padding: '6px 8px',
                        fontSize: 11, fontWeight: 500, color: isActive ? 'var(--accent)' : sub,
                        textAlign: 'center', background: 'var(--lg-fill-thin)',
                      }}>{p.label}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ════ 在线图库 Tab ════ */}
          {activeTab === 'online' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* 主题分类筛选 */}
              <div>
                <div style={labelStyle}>按主题浏览</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    style={{
                      padding: '4px 12px', borderRadius: 'var(--lg-radius-pill)', border: `1px solid ${bd}`,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-apple)',
                      background: selectedTheme === '' ? 'var(--accent)' : bg2,
                      color:      selectedTheme === '' ? 'var(--text-on-accent, #fff)' : sub,
                      transition: 'all 0.15s',
                    }}
                    onClick={() => { setSelectedTheme(''); loadPicsumPhotos(1) }}
                  ><Dices size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />随机</button>
                  {THEMES.map(t => (
                    <button key={t.id}
                      style={{
                        padding: '4px 12px', borderRadius: 'var(--lg-radius-pill)', border: `1px solid ${bd}`,
                        fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-apple)',
                        background: selectedTheme === t.id ? 'var(--accent)' : bg2,
                        color:      selectedTheme === t.id ? 'var(--text-on-accent, #fff)' : sub,
                        transition: 'all 0.15s',
                      }}
                      onClick={() => loadThemePhotos(t.kw, t.id)}
                    >{t.label}</button>
                  ))}
                </div>
              </div>

              {/* 图片网格 */}
              <div>
                <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span>Picsum Photos · 免费高清无版权</span>
                  {!selectedTheme && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => loadPicsumPhotos(Math.max(1, photosPage - 1))} disabled={photosPage <= 1 || loadingPhotos}
                        style={{ padding: '2px 10px', borderRadius: 8, border: `1px solid ${bd}`, background: bg2, color: sub, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>‹</button>
                      <span style={{ color: sub, fontSize: 11, lineHeight: '26px' }}>第 {photosPage} 页</span>
                      <button onClick={() => loadPicsumPhotos(photosPage + 1)} disabled={loadingPhotos}
                        style={{ padding: '2px 10px', borderRadius: 8, border: `1px solid ${bd}`, background: bg2, color: sub, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>›</button>
                    </div>
                  )}
                </div>

                {loadingPhotos ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: sub, fontSize: 13 }}>
                    <div style={{ fontSize: 24, marginBottom: 8, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</div>
                    <div>加载中…</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {photos.map(photo => {
                      const thumb = thumbUrl(photo)
                      const full  = fullUrl(photo)
                      const isActive = settings.wallpaper === full
                      return (
                        <button key={photo.id}
                          onClick={() => onSave('wallpaper', full)}
                          onMouseEnter={() => setPreviewUrl(thumb)}
                          onMouseLeave={() => setPreviewUrl('')}
                          title={`作者: ${photo.author}`}
                          style={{
                            position: 'relative', width: '100%', aspectRatio: '16/10',
                            borderRadius: 9, cursor: 'pointer', overflow: 'hidden',
                            border: isActive ? '2.5px solid var(--accent)' : `1.5px solid ${bd}`,
                            background: `url(${thumb}) center/cover`,
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            transform: isActive ? 'scale(0.95)' : undefined,
                            boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent)' :'none',
                          }}>
                          {isActive && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }}>
                              <span style={{ fontSize: 14, filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.6))' }}>✓</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* hover 预览条 */}
              {previewUrl && (
                <div style={{
                  position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 400, borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  border: '2px solid rgba(255,255,255,0.2)',
                  width: 240, aspectRatio: '16/10',
                  background: `url(${previewUrl}) center/cover`,
                  animation: 'fadeIn 0.15s',
                }} />
              )}
            </div>
          )}

          {/* ════ 自定义 Tab ════ */}
          {activeTab === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={labelStyle}>输入图片 URL</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{
                      flex: 1, padding: '9px 13px', borderRadius: 11,
                      border: `1px solid ${bd}`, background: bg2, color: txt,
                      fontSize: 13, outline: 'none', fontFamily: 'inherit',
                    }}
                    placeholder="https://example.com/image.jpg"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && customUrl.trim()) { onSave('wallpaper', customUrl.trim()); setCustomUrl('') } }}
                  />
                  <button onClick={() => { if (customUrl.trim()) { onSave('wallpaper', customUrl.trim()); setCustomUrl('') } }}
                    style={{ padding: '0 18px', borderRadius: 'var(--lg-radius-md)', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--text-on-accent, #fff)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-apple)', flexShrink: 0 }}>
                    应用
                  </button>
                </div>
                <div style={{ fontSize: 11, color: sub, marginTop: 6 }}>
                  支持 Unsplash / Pexels / 任意图片直链
                </div>
              </div>

              <div>
                <div style={labelStyle}>上传本地图片</div>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 12, cursor: 'pointer',
                    border: `2px dashed ${bd}`, background: bg2, color: sub,
                    fontSize: 13, fontFamily: 'inherit', transition: 'border-color 0.15s',
                  }}>
                  <FolderOpen size={15} aria-hidden="true" style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />点击选择图片（JPG / PNG / WEBP）
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => onSave('wallpaper', ev.target?.result as string)
                    reader.readAsDataURL(file)
                  }}
                />
                <div style={{ fontSize: 11, color: sub, marginTop: 6 }}>
                  本地图片以 Base64 存储在 localStorage 中
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 调节滑块（固定在底部） */}
        {settings.wallpaper && (
          <div style={{
            padding: '14px 22px 18px',
            borderTop: `1px solid ${bd}`,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            flexShrink: 0,
          }}>
            <div>
              <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>模糊度</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{blur}px</span>
              </div>
              <input type="range" min={0} max={20} step={1} value={blur} style={sliderStyle}
                onChange={e => { setBlur(Number(e.target.value)); onSave('wallpaperBlur', Number(e.target.value)) }} />
            </div>
            <div>
              <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>遮罩深度</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{Math.round(dim * 100)}%</span>
              </div>
              <input type="range" min={0} max={0.8} step={0.05} value={dim} style={sliderStyle}
                onChange={e => { setDim(Number(e.target.value)); onSave('wallpaperDim', Number(e.target.value)) }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes skinPanelIn {
          from { opacity: 0; transform: translate(-50%, -47%) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--accent); cursor: pointer;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
        }
      `}</style>
    </>
  )
}
