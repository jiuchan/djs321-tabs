// 从未知错误里安全取出可读消息（替代 catch (e: any) { e.message }）。
// 返回 undefined 时调用方可用 `?? 兜底文案` 或 `|| 兜底文案`。
export function errMsg(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return undefined
}
