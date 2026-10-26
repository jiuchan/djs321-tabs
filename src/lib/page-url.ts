export function isBrowserContentUrl(url: string | null | undefined): boolean {
  return Boolean(url && /^(https?|file):\/\//i.test(url))
}

export function tabsInWindow<T extends { windowId: number }>(tabs: T[], windowId: number | undefined): T[] {
  return windowId === undefined ? [] : tabs.filter(tab => tab.windowId === windowId)
}

interface TabChangeEvent {
  addListener(listener: () => void): void
  removeListener(listener: () => void): void
}

export function observeBrowserTabs<T extends { url?: string }>(
  query: (callback: (tabs: T[]) => void) => void,
  events: TabChangeEvent[],
  publish: (tabs: T[]) => void,
): () => void {
  let disposed = false
  let revision = 0
  const refresh = () => {
    const requestedRevision = ++revision
    query(tabs => {
      // A created tab may not have a committed URL yet; later events refresh it.
      if (!disposed && requestedRevision === revision) {
        publish(tabs.filter(tab => isBrowserContentUrl(tab.url)))
      }
    })
  }
  events.forEach(event => event.addListener(refresh))
  refresh()
  return () => {
    disposed = true
    events.forEach(event => event.removeListener(refresh))
  }
}
