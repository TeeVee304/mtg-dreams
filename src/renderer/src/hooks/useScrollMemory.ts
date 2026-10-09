import { useLayoutEffect, useRef, type UIEvent } from 'react'

/**
 * Remembers the scroll position of each page for the session: a page opened again comes back
 * where it was left, and a page not opened yet starts at the top.
 * @param page - Identity of the page shown.
 * @returns The scrolling element's ref and scroll handler.
 */
export function useScrollMemory<T extends HTMLElement>(page: string) {
  const ref = useRef<T>(null)
  /** Scroll position of each page left this session. */
  const scrolls = useRef(new Map<string, number>())
  const shown = useRef(page)
  useLayoutEffect(() => {
    if (shown.current === page) return
    shown.current = page
    if (ref.current) ref.current.scrollTop = scrolls.current.get(page) ?? 0
  }, [page])
  const onScroll = (event: UIEvent<T>) => scrolls.current.set(shown.current, event.currentTarget.scrollTop)
  return { ref, onScroll }
}
