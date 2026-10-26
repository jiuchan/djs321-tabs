import { db } from '../lib/db'
import { brandName } from '../lib/brand'
import { handleTabActionMessage } from './message-handler'
import { isBrowserContentUrl } from '../lib/page-url'
import { createUndoRestorer } from '../lib/tab-actions'
import { acceptDesktopDiscovery } from '../lib/desktop-discovery'

// Web pages can only report a registered, signed local handshake; never request actions or secrets.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  void acceptDesktopDiscovery(message, sender).then(ok => sendResponse({ ok }), () => sendResponse({ ok: false }))
  return true
})

const restoreUndo = createUndoRestorer({
  get: id => db.undo.get(id),
  open: url => chrome.tabs.create({ url, active: false }),
  remove: id => db.undo.delete(id),
})

// 归档 Tab（可选关闭）
async function archiveTab(tab: chrome.tabs.Tab, close = false) {
  if (!isBrowserContentUrl(tab.url) || tab.id == null) throw new Error('该页面无法归档。')
  const url = tab.url!
  let undoId: number | undefined
  await db.transaction('rw', db.archived, db.undo, async () => {
    await db.archived.add({ title: tab.title || url, url, favicon: tab.favIconUrl, archivedAt: new Date() })
    if (close) {
      const id = await db.undo.add({ title: tab.title || url, url, closedAt: new Date() })
      if (typeof id !== 'number') throw new Error('撤销记录保存失败。')
      undoId = id
    }
  })
  if (close) {
    try {
      await chrome.tabs.remove(tab.id)
    } catch (error) {
      if (undoId !== undefined) await db.undo.delete(undoId)
      throw error
    }
  }
  return { undoId }
}

function notify(title: string, message: string, silent = false) {
  // Notifications must not turn a completed action into an apparent failure.
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      silent,
    }, () => { void chrome.runtime.lastError })
  } catch (error) {
    console.warn('[DJS321 Tabs] notification unavailable:', error)
  }
}

// 快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab) return
    if (command === 'archive-tab') await archiveTab(tab, false)
    if (command === 'close-and-archive') await archiveTab(tab, true)
    if (command === 'archive-tab' || command === 'close-and-archive') {
      notify(brandName(), command === 'archive-tab' ? '已归档，原标签保留。' : '已保存链接并关闭标签。')
    }
    if (command === 'send-to-justdoit') {
      const { sendToJustDoIt, extractMarkdownFromTab } = await import('../lib/justdoit')
      const content = tab.id != null ? await extractMarkdownFromTab(tab.id, tab.url) : undefined
      await sendToJustDoIt({ title: tab.title || 'Untitled', url: tab.url || '', content })
      notify('已发送至倒计时321', tab.title || tab.url || '成功保存为任务', true)
    }
  } catch (error) {
    console.error('[DJS321 Tabs] shortcut failed:', error)
    notify(`${brandName()} 操作未完成`, error instanceof Error ? error.message : '请打开插件检查设置后重试。')
  }
})

// 消息接口（供 popup 调用）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false
  const handledTabAction = handleTabActionMessage(
    msg,
    {
      getTab: (tabId, callback) => {
        chrome.tabs.get(tabId, tab => {
          callback(tab, chrome.runtime.lastError?.message)
        })
      },
      archiveTab,
    },
    sendResponse,
    message => console.warn('[DJS321 Tabs] message action failed:', message),
  )
  // Keep the channel open until persistence and any close action finish.
  if (handledTabAction) return true

  if (msg.type === 'UNDO_ARCHIVE') {
    ;(async () => {
      try {
        const restored = await restoreUndo(msg.undoIds)
        if (!restored) throw new Error('没有可恢复的记录。')
        sendResponse({ ok: true, restored })
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '恢复标签失败' })
      }
    })()
    return true
  }
  return false
})
