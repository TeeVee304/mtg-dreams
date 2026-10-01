import { useEffect } from 'react'
import type { InventoryItem } from '../../../shared/types'
import { loadBaselines, syncBaselines, syncTracked } from '../history'
import type { CardList } from '../library'
import { usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'

// Keeps the price history in step with your lists, in the background: which versions
// to keep a history of, and wishlist cards' prices when added. Draws nothing.

const SETTLE_MS = 2000

export function HistorySync({ ready, lists, inventory }: { ready: boolean; lists: CardList[]; inventory: Map<string, InventoryItem> }) {
  const printingsVersion = usePrintingsVersion()
  const { bundleBasics } = useSettings()

  useEffect(() => {
    void loadBaselines()
  }, [])

  // Waits for edits and price loading to settle rather than run on every change.
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
