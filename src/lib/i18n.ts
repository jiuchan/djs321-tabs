import en from '../../public/_locales/en/messages.json' with { type: 'json' }

// 界面文案统一走 _locales（chrome.i18n 按浏览器语言选择，缺省 en）。
// 占位符用 {name}，由这里自行替换，messages.json 里不使用 chrome 的 $ 占位语法。
// 非扩展环境（单测、设计预览）回退到随包的英文文案。
export type MessageKey = keyof typeof en
export type MessageVars = Record<string, string | number>

const FALLBACK = en as Record<string, { message: string }>

export function t(key: MessageKey, vars?: MessageVars): string {
  let text = ''
  try {
    if (typeof chrome !== 'undefined') text = chrome.i18n?.getMessage(key) || ''
  } catch {
    text = ''
  }
  if (!text) text = FALLBACK[key]?.message ?? key
  return vars ? formatMessage(text, vars) : text
}

export function formatMessage(text: string, vars: MessageVars): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

// 计数文案：英文区分单复数，中文两条写成一样即可
export function plural(one: MessageKey, other: MessageKey, count: number, vars?: MessageVars): string {
  return t(count === 1 ? one : other, { count, ...vars })
}

// 日期、时间格式化用的语言标签，跟随浏览器界面语言
export function uiLocale(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) return chrome.i18n.getUILanguage() || 'en'
  } catch {
    return 'en'
  }
  return 'en'
}
