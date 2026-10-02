import { useEffect } from 'react'
import type { InventoryItem } from '../../../shared/types'
import { loadBaselines, syncBaselines, syncTracked } from '../history'
import type { CardList } from '../library'
import { usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'

/** Debounce before syncing after changes. */
const SETTLE_MS = 2000

/** Renderless: debounced {@link syncTracked} and {@link syncBaselines} after list, inventory or price changes. */
export function HistorySync({ ready, lists, inventory }: { ready: boolean; lists: CardList[]; inventory: Map<string, InventoryItem> }) {
  const printingsVersion = usePrintingsVersion()
  const { bundleBasics } = useSettings()

  useEffect(() => {
    void loadBaselines()
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      syncBaselines(lists.filter((list) => list.kind === 'wishlist'), inventory, bundleBasics)
      syncTracked(inventory, bundleBasics)
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [ready, lists, inventory, bundleBasics, printingsVersion])

  return null
}
