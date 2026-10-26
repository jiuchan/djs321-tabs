// 指数退避重试（自包含、无副作用，可单测）。
export interface RetryableError extends Error {
  retryable?: boolean
  cause?: unknown
}

/**
 * 重试 fn，指数退避（base * 2^attempt）。
 * 仅当错误未显式标记 retryable=false 时重试——网络/5xx 重试，4xx/业务拒绝不重试。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 2
  const base = opts.baseDelayMs ?? 500
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const retryable = (e as RetryableError)?.retryable !== false
      if (attempt === retries || !retryable) break
      if (base > 0) await new Promise(r => setTimeout(r, base * 2 ** attempt))
    }
  }
  throw lastErr
}
