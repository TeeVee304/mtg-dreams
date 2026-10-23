import { useRef, useState } from 'react'

/**
 * @returns An object with `handlers`' methods that never changes, each calling the latest render's
 * method; so memoized components given it re-render only when their data changes. Its methods are
 * those of the first render's `handlers`.
 */
export function useStableHandlers<T extends { [K in keyof T]: (...args: never[]) => unknown }>(handlers: T): T {
  const latest = useRef(handlers)
  latest.current = handlers
  const [stable] = useState(
    () =>
      Object.fromEntries(
        Object.keys(handlers).map((key) => [key, (...args: never[]) => latest.current[key as keyof T](...args)])
      ) as T
  )
  return stable
}
