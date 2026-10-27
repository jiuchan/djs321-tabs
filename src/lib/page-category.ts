import { t, type MessageKey } from './i18n.ts'

export type PageCategoryId =
  | 'ai' | 'dev' | 'cloud' | 'design' | 'finance' | 'video' | 'news'
  | 'geek' | 'shopping' | 'social' | 'music' | 'mail' | 'docs' | 'default'

export const DEFAULT_CATEGORY_ID: PageCategoryId = 'default'

export const CATEGORY_RULES: [PageCategoryId, RegExp][] = [
  ['ai', /(?:^|\.)(?:chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|perplexity\.ai|poe\.com|gemini\.google\.com|huggingface\.co|midjourney\.com|civitai\.com|skillhub\.cn)$/i],
  ['dev', /^(?:localhost|127\.0\.0\.1)$|(?:^|\.)(?:github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|npmjs\.com|jsfiddle\.net|codepen\.io|codesandbox\.io)$/i],
  ['cloud', /(?:^|\.)(?:aws\.amazon\.com|amazonaws\.com|cloudflare\.com|vercel\.com|netlify\.com|digitalocean\.com|aliyun\.com|cloud\.tencent\.com|azure\.com|portal\.azure\.com|heroku\.com|render\.com|netcup\.(?:eu|de)|racknerd\.com)$/i],
  ['design', /(?:^|\.)(?:figma\.com|dribbble\.com|behance\.net|pinterest\.com|canva\.com|unsplash\.com|pixabay\.com|pexels\.com)$/i],
  ['finance', /(?:^|\.)(?:tradingview\.com|binance\.com|okx\.com|coinbase\.com|alipay\.com|paypal\.com|finance\.yahoo\.com)$/i],
  ['video', /(?:^|\.)(?:youtube\.com|youtu\.be|bilibili\.com|netflix\.com|twitch\.tv|vimeo\.com|youku\.com|iqiyi\.com)$/i],
  ['news', /(?:^|\.)(?:zhihu\.com|36kr\.com|ycombinator\.com|medium\.com|substack\.com|reddit\.com|mp\.weixin\.qq\.com|news\.qq\.com|sina\.com\.cn)$/i],
  ['geek', /(?:^|\.)(?:nodeseek\.com|linux\.do|v2ex\.com|hostloc\.com|52pojie\.cn|vpsgo\.com|coolapk\.com)$/i],
  ['shopping', /(?:^|\.)(?:amazon\.(?:com|cn|co\.uk|de|co\.jp)|taobao\.com|jd\.com|tmall\.com|shopify\.com|ebay\.(?:com|co\.uk|de)|pinduoduo\.com)$/i],
  ['social', /(?:^|\.)(?:twitter\.com|x\.com|weibo\.com|discord\.com|slack\.com|telegram\.org|t\.me|linkedin\.com|facebook\.com)$/i],
  ['music', /(?:^|\.)(?:spotify\.com|music\.163\.com|music\.apple\.com|soundcloud\.com|y\.qq\.com)$/i],
  ['mail', /(?:^|\.)(?:mail\.google\.com|outlook\.com|proton\.me|mail\.qq\.com|mail\.163\.com)$/i],
  ['docs', /(?:^|\.)(?:notion\.so|notion\.com|confluence\.atlassian\.com|docs\.google\.com|feishu\.cn|yuque\.com|gitbook\.com|wikipedia\.org)$/i],
]

// 分类以稳定 id 判定，显示名按界面语言取；快捷链接里存的是显示名（用户可改），沿用旧数据不迁移
export function inferPageCategoryId(url: string, title = ''): PageCategoryId {
  let parsed: URL
  try { parsed = new URL(url) } catch { return 'default' }
  if (!['http:', 'https:'].includes(parsed.protocol)) return 'default'
  const host = parsed.hostname.toLowerCase()
  // Classify the actual host, never brand names embedded in another site's URL.
  for (const [label, regex] of CATEGORY_RULES) {
    if (regex.test(host)) return label
  }
  if (host === 'qq.com' && parsed.pathname.startsWith('/mail')) return 'mail'
  if (host === 'qq.com' && parsed.pathname.startsWith('/music')) return 'music'
  if (host === 'qq.com' && parsed.pathname.startsWith('/news')) return 'news'
  if (host === '163.com' && parsed.pathname.startsWith('/mail')) return 'mail'
  if (/^(?:developer|docs)\./i.test(host)) return 'dev'
  if (/\b(?:AI|LLM|ChatGPT|Claude)\b|人工智能|大模型|智能体/i.test(title)) return 'ai' // i18n-allow: 匹配页面标题内容
  return 'default'
}

export function categoryLabel(id: PageCategoryId): string {
  return t(`category_${id}` as MessageKey)
}

export function inferPageCategory(url: string, title = ''): string {
  return categoryLabel(inferPageCategoryId(url, title))
}
