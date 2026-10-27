import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { t } from '../lib/i18n'

const scope = globalThis as typeof globalThis & { __tabButlerExtractorLoaded?: boolean }
if (!scope.__tabButlerExtractorLoaded) {
scope.__tabButlerExtractorLoaded = true
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONTENT') {
    try {
      const clone = document.cloneNode(true) as Document
      const reader = new Readability(clone)
      const article = reader.parse()
      if (article && article.content) {
        const turndown = new TurndownService({ headingStyle: 'atx' })
        sendResponse({ content: turndown.turndown(article.content) })
      } else {
        sendResponse({ content: null })
      }
    } catch(e) {
      console.error('Extraction failed:', e)
      sendResponse({ error: t('content_extractFailed') })
    }
    return false
  }
  return false
})
}
