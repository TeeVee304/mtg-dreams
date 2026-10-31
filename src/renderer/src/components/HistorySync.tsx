import { useEffect } from 'react'
import type { InventoryItem } from '@shared/types'
import { useCopyPool } from '../hooks/useCopyPool'
import { loadBaselines, syncBaselines, syncTracked } from '../stores/history'
import type { CardList } from '../stores/library'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'

/** Debounce before syncing after changes. */
const SETTLE_MS = 2000

/** Renderless: debounced {@link syncTracked} and {@link syncBaselines} after list, inventory or price changes. */
export function HistorySync({ ready, lists, inventory }: { ready: boolean; lists: CardList[]; inventory: Map<string, InventoryItem> }) {
  const printingsVersion = usePrintingsVersion()
  const { bundleBasics, skipUniversesBeyond, skipSecretLair, skipPhyrexian } = useSettings()
  const pool = useCopyPool(lists)

  useEffect(() => {
    void loadBaselines()
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      syncBaselines(lists.filter((list) => list.kind === 'wishlist'), inventory, bundleBasics, pool, { skipUniversesBeyond, skipSecretLair, skipPhyrexian })
      syncTracked(inventory, bundleBasics)
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [ready, lists, inventory, bundleBasics, skipUniversesBeyond, skipSecretLair, skipPhyrexian, pool, printingsVersion])

  return null
}
