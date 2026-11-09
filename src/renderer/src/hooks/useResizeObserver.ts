import { useLayoutEffect, useRef } from 'react'

/**
 * Calls `onResize` whenever one of `targets` changes size, and once as they are first observed,
 * while `active`. It waits for the next frame, so a layout it changes never answers its own
 * notification.
 * @param targets - The elements to watch, read when the effect runs; missing ones are skipped.
 * @param deps - Watch again when these change (the elements may be new).
 */
export function useResizeObserver(active: boolean, targets: () => Array<Element | null | undefined>, onResize: () => void, deps: unknown[] = []): void {
  const callback = useRef(onResize)
  callback.current = onResize
  useLayoutEffect(() => {
    if (!active) return
    const elements = targets().filter((element): element is Element => !!element)
    if (elements.length === 0) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => callback.current())
    })
    for (const element of elements) observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
    // The targets are read afresh whenever `active` or `deps` change.
  }, [active, ...deps])
}
