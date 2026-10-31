'use client'

import { useEffect, useState } from 'react'

/**
 * Renders a long list in pages: the first `pageSize` items immediately, then more as the
 * sentinel element nears the viewport. Keeps a section switch fast no matter how many
 * transactions exist. `resetKey` restarts the list when a filter or search changes.
 */
export function useIncrementalList<T>(items: T[], resetKey: string, pageSize = 20) {
  const [state, setState] = useState({ key: resetKey, limit: pageSize })
  const [node, setNode] = useState<HTMLDivElement | null>(null)

  const limit = state.key === resetKey ? state.limit : pageSize
  const hasMore = items.length > limit

  useEffect(() => {
    if (!node || !hasMore) return
    // Re-created after every page, so a sentinel that is still on screen loads the next one.
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setState(s => ({ key: resetKey, limit: (s.key === resetKey ? s.limit : pageSize) + pageSize }))
        }
      },
      { rootMargin: '800px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, hasMore, limit, resetKey, pageSize])

  return { visible: items.slice(0, limit), hasMore, sentinelRef: setNode }
}
