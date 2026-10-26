// 产品名由 _locales 按浏览器语言提供；非扩展环境（单测、设计预览）回退到英文字标
export const BRAND_FALLBACK = 'DJS321 Tabs'

export function brandName(): string {
  try {
    return (typeof chrome !== 'undefined' && chrome.i18n?.getMessage('extName')) || BRAND_FALLBACK
  } catch {
    return BRAND_FALLBACK
  }
}
