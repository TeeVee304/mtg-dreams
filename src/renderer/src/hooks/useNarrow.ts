import { useSyncExternalStore } from 'react'

/** Narrow windows: the sidebar becomes an icon rail. Keep in step with narrow.css. */
const NARROW = '(max-width: 960px)'

/** Windows too narrow for a Version column: card tables show the version under the name. Keep in step with narrow.css. */
const NARROW_TABLES = '(max-width: 1100px)'

function subscribe(media: string) {
  return (onChange: () => void): (() => void) => {
    const list = window.matchMedia(media)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
}

const subscribeNarrow = subscribe(NARROW)
const subscribeNarrowTables = subscribe(NARROW_TABLES)

/** @returns Whether the window is narrow (see {@link NARROW}); updates on resize. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches)
}

/** @returns Whether card tables drop their Version column (see {@link NARROW_TABLES}); updates on resize. */
export function useNarrowTables(): boolean {
  return useSyncExternalStore(subscribeNarrowTables, () => window.matchMedia(NARROW_TABLES).matches)
}
