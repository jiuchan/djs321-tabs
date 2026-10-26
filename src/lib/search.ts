export function resolveSearchUrl(input: string, engineUrl: string): string | null {
  const query = input.trim()
  if (!query) return null

  let candidate: string | undefined
  if (/^https?:\/\//i.test(query)) candidate = query
  else if (/^localhost(?::\d+)?(?:[/?#]|$)/i.test(query)) candidate = `http://${query}`
  else if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#].*)?$/.test(query)) candidate = `http://${query}`
  else if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?(?:[/?#].*)?$/i.test(query)) {
    // Common filename suffixes should not turn local-search terms into navigation.
    if (!/\.(?:tsx?|jsx?|json|css|html|pdf)(?:[/?#]|$)/i.test(query)) candidate = `https://${query}`
  }

  if (candidate) {
    try {
      const url = new URL(candidate)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    } catch { /* Invalid URLs remain searchable. */ }
  }
  return `${engineUrl}${encodeURIComponent(query)}`
}
