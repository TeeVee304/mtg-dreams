import { useSyncExternalStore } from 'react'

/** Change notifier of a module-level store, from {@link createSignal}. */
export interface Signal {
  /** Bumps the version and notifies subscribers. */
  emit(): void
  /** @returns Version; it changes on every notification, so it keys values derived from the store. */
  version(): number
  /** Hook re-rendering on every notification. @returns Version. */
  useVersion(): number
}

/**
 * @param delayMs - Wait after a change before notifying, gathering the changes that follow into one
 *   notification; none by default.
 */
export function createSignal(delayMs?: number): Signal {
  const listeners = new Set<() => void>()
  let version = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const notify = () => {
    timer = null
    version += 1
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const getVersion = () => version
  return {
    emit() {
      if (delayMs === undefined) notify()
      else timer ??= setTimeout(notify, delayMs)
    },
    version: getVersion,
    useVersion: () => useSyncExternalStore(subscribe, getVersion)
  }
}
