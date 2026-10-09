import { useCallback, useEffect, useMemo, useState } from 'react'
import { bundledBasic } from '@shared/basics'
import type { InventoryItem } from '@shared/types'
import { cardLines } from '@shared/decklist'
import { cleanError, formatDate } from '../lib/format'
import { sameList, type CardList, type ListRef } from '../stores/library'
import { refreshStalePrintings, reloadPrices, requestPrintings } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { useToast } from '../components/Toasts'

/** How often printings older than a week are fetched again. */
const STALE_CHECK_MS = 60 * 60 * 1000

/**
 * Keeps prices current: fetches every card's printings (the open list's first, then the other
 * lists', then the rest of the inventory, for its value; bundled basics skipped), refreshes stale
 * printings hourly, and reloads prices when the main process has a newer price guide.
 * @returns The price guide's publication time, and a refresh that says what it found.
 */
export function usePrices(lists: CardList[], inventory: Map<string, InventoryItem>, active: ListRef | null) {
  const toast = useToast()
  const { bundleBasics } = useSettings()
  /** Publication time of the price guide in use. */
  const [pricedAt, setPricedAt] = useState<number | null>(null)

  const namesKey = useMemo(
    () =>
      [
        ...[...lists]
          .sort((a, b) => Number(active !== null && sameList(b, active)) - Number(active !== null && sameList(a, active)))
          .flatMap((list) => cardLines(list.lines).map((line) => line.name)),
        ...[...inventory.values()].map((item) => item.name)
      ]
        .filter((name) => !bundledBasic(name, bundleBasics))
        .join('\n'),
    [lists, inventory, active, bundleBasics]
  )
  useEffect(() => {
    for (const name of namesKey.split('\n')) if (name) requestPrintings(name)
  }, [namesKey])

  useEffect(() => {
    const timer = setInterval(refreshStalePrintings, STALE_CHECK_MS)
    return () => clearInterval(timer)
  }, [])

  const loadPriceDate = useCallback(() => window.api.getPriceDate().then(setPricedAt, () => undefined), [])
  useEffect(() => void loadPriceDate(), [loadPriceDate])
  useEffect(
    () =>
      window.api.onPricesUpdated(() => {
        void reloadPrices()
        void loadPriceDate()
      }),
    [loadPriceDate]
  )

  /** Checks Cardmarket for a newer price guide and says what it found. */
  const refreshPrices = () =>
    window.api.refreshPrices().then(
      ({ updated, pricedAt: at }) => {
        setPricedAt(at)
        toast(
          updated
            ? `New Cardmarket prices loaded (${formatDate(at!)})`
            : `Prices are up to date: Cardmarket, ${at ? formatDate(at) : 'not loaded yet'}`
        )
      },
      (error) => toast(cleanError(error), 'error')
    )

  return { pricedAt, refreshPrices }
}
