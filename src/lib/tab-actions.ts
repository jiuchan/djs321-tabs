export interface TabActionResponse {
  ok: boolean
  error?: string
  undoIds?: number[]
}

export type TabActionRequest = {
  type: 'ARCHIVE_TAB' | 'CLOSE_AND_ARCHIVE' | 'UNDO_ARCHIVE'
  tabId?: number
  undoIds?: number[]
}

export async function requestTabAction(
  message: TabActionRequest,
  send: (message: TabActionRequest) => Promise<unknown> = message => chrome.runtime.sendMessage(message),
): Promise<TabActionResponse> {
  const response = await send(message) as TabActionResponse | undefined
  if (response?.ok !== true) throw new Error(response?.error || '操作未完成，请重试。')
  return response
}

export async function requestUndoActions(ids: number[], send?: (message: TabActionRequest) => Promise<unknown>): Promise<void> {
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('无效的撤销记录。')
  const uniqueIds = [...new Set(ids)]
  for (let start = 0; start < uniqueIds.length; start += 200) {
    await requestTabAction({ type: 'UNDO_ARCHIVE', undoIds: uniqueIds.slice(start, start + 200) }, send)
  }
}

type UndoDependencies = {
  get: (id: number) => Promise<{ url: string } | undefined>
  open: (url: string) => Promise<unknown>
  remove: (id: number) => Promise<unknown>
}

export function createUndoRestorer(deps: UndoDependencies): (ids: unknown) => Promise<number> {
  let queue: Promise<unknown> = Promise.resolve()
  return ids => {
    // One worker queue prevents two clicks from opening the same saved record.
    const operation = queue.then(() => restoreUndoRecords(ids, deps))
    queue = operation.catch(() => {})
    return operation
  }
}

export async function restoreUndoRecords(ids: unknown, deps: UndoDependencies): Promise<number> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error('无效的撤销记录。')
  }
  let restored = 0
  for (const id of new Set<number>(ids)) {
    const record = await deps.get(id)
    if (!record) continue
    let protocol: string
    try { protocol = new URL(record.url).protocol } catch { throw new Error('撤销地址无效。') }
    if (!['http:', 'https:', 'file:'].includes(protocol)) throw new Error('撤销地址不可打开。')
    await deps.open(record.url)
    // Retain the record when opening fails, so that a retry remains possible.
    await deps.remove(id)
    restored++
  }
  return restored
}
