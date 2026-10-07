import { useSyncExternalStore } from 'react'

/** Narrow windows: the sidebar becomes an icon rail and tables drop their Version column. Keep in step with narrow.css. */
const NARROW = '(max-width: 960px)'

const query = () => window.matchMedia(NARROW)

function subscribe(onChange: () => void): () => void {
  const list = query()
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** @returns Whether the window is narrow (see {@link NARROW}); updates on resize. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => query().matches)
}
