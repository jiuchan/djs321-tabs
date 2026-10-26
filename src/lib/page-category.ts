export const CATEGORY_RULES: [string, RegExp][] = [
  ['🤖 AI 助手', /(?:^|\.)(?:chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|perplexity\.ai|poe\.com|gemini\.google\.com|huggingface\.co|midjourney\.com|civitai\.com|skillhub\.cn)$/i],
  ['💻 开发工具', /^(?:localhost|127\.0\.0\.1)$|(?:^|\.)(?:github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|npmjs\.com|jsfiddle\.net|codepen\.io|codesandbox\.io)$/i],
  ['☁️ 云服务与运维', /(?:^|\.)(?:aws\.amazon\.com|amazonaws\.com|cloudflare\.com|vercel\.com|netlify\.com|digitalocean\.com|aliyun\.com|cloud\.tencent\.com|azure\.com|portal\.azure\.com|heroku\.com|render\.com|netcup\.(?:eu|de)|racknerd\.com)$/i],
  ['🎨 设计与素材', /(?:^|\.)(?:figma\.com|dribbble\.com|behance\.net|pinterest\.com|canva\.com|unsplash\.com|pixabay\.com|pexels\.com)$/i],
  ['📈 金融理财', /(?:^|\.)(?:tradingview\.com|binance\.com|okx\.com|coinbase\.com|alipay\.com|paypal\.com|finance\.yahoo\.com)$/i],
  ['📺 视频娱乐', /(?:^|\.)(?:youtube\.com|youtu\.be|bilibili\.com|netflix\.com|twitch\.tv|vimeo\.com|youku\.com|iqiyi\.com)$/i],
  ['📰 资讯阅读', /(?:^|\.)(?:zhihu\.com|36kr\.com|ycombinator\.com|medium\.com|substack\.com|reddit\.com|mp\.weixin\.qq\.com|news\.qq\.com|sina\.com\.cn)$/i],
  ['🔥 极客社区', /(?:^|\.)(?:nodeseek\.com|linux\.do|v2ex\.com|hostloc\.com|52pojie\.cn|vpsgo\.com|coolapk\.com)$/i],
  ['🛒 购物电商', /(?:^|\.)(?:amazon\.(?:com|cn|co\.uk|de|co\.jp)|taobao\.com|jd\.com|tmall\.com|shopify\.com|ebay\.(?:com|co\.uk|de)|pinduoduo\.com)$/i],
  ['💬 社交沟通', /(?:^|\.)(?:twitter\.com|x\.com|weibo\.com|discord\.com|slack\.com|telegram\.org|t\.me|linkedin\.com|facebook\.com)$/i],
  ['🎵 音乐', /(?:^|\.)(?:spotify\.com|music\.163\.com|music\.apple\.com|soundcloud\.com|y\.qq\.com)$/i],
  ['📧 邮件', /(?:^|\.)(?:mail\.google\.com|outlook\.com|proton\.me|mail\.qq\.com|mail\.163\.com)$/i],
  ['📄 文档协作', /(?:^|\.)(?:notion\.so|notion\.com|confluence\.atlassian\.com|docs\.google\.com|feishu\.cn|yuque\.com|gitbook\.com|wikipedia\.org)$/i],
]

export function inferPageCategory(url: string, title = '') {
  let parsed: URL
  try { parsed = new URL(url) } catch { return '默认' }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '默认'
  const host = parsed.hostname.toLowerCase()
  // Classify the actual host, never brand names embedded in another site's URL.
  for (const [label, regex] of CATEGORY_RULES) {
    if (regex.test(host)) return label
  }
  if (host === 'qq.com' && parsed.pathname.startsWith('/mail')) return '📧 邮件'
  if (host === 'qq.com' && parsed.pathname.startsWith('/music')) return '🎵 音乐'
  if (host === 'qq.com' && parsed.pathname.startsWith('/news')) return '📰 资讯阅读'
  if (host === '163.com' && parsed.pathname.startsWith('/mail')) return '📧 邮件'
  if (/^(?:developer|docs)\./i.test(host)) return '💻 开发工具'
  if (/\b(?:AI|LLM|ChatGPT|Claude)\b|人工智能|大模型|智能体/i.test(title)) return '🤖 AI 助手'
  return '默认'
}
