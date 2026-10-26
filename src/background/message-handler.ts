type TabActionMessage = {
  type?: string
  tabId?: number
}

type SendResponse = (response: { ok: boolean; error?: string; undoIds?: number[] }) => void
type LogError = (message: string) => void

interface TabActionDeps {
  getTab: (tabId: number, callback: (tab?: chrome.tabs.Tab, error?: string) => void) => void
  archiveTab: (tab: chrome.tabs.Tab, close: boolean) => Promise<void | { undoId?: number }>
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error')
}

export function handleTabActionMessage(
  msg: TabActionMessage,
  deps: TabActionDeps,
  sendResponse: SendResponse,
  logError: LogError = console.warn,
) {
  const shouldClose = msg.type === 'CLOSE_AND_ARCHIVE'
  if (msg.type !== 'ARCHIVE_TAB' && msg.type !== 'CLOSE_AND_ARCHIVE') {
    return false
  }

  if (!Number.isInteger(msg.tabId) || (msg.tabId ?? -1) < 0) {
    sendResponse({ ok: false, error: 'Invalid tabId' })
    return true
  }

  deps.getTab(msg.tabId!, (tab, error) => {
    if (error || !tab) {
      logError(error || 'Tab not found')
      sendResponse({ ok: false, error: error || 'Tab not found' })
      return
    }

    deps.archiveTab(tab, shouldClose)
      .then(result => sendResponse(result?.undoId === undefined
        ? { ok: true }
        : { ok: true, undoIds: [result.undoId] }))
      .catch(err => {
        const error = getErrorMessage(err)
        logError(error)
        sendResponse({ ok: false, error })
      })
  })

  return true
}
