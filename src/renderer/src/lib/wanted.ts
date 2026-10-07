import type { AppSettings } from '@shared/api'
import { bundledBasic } from '@shared/basics'
import type { CopyPool } from '@shared/copies'
import type { InventoryItem, PriceBasis, Printing } from '@shared/types'
import { costOf, mostWanted, type MostWanted, type UnitPrice, type WantedCard } from '@shared/wanted'
import type { CardList } from '../stores/library'
import { cheapestVersion, getPrintingsVersion } from '../stores/printings'
import { memoLast } from './memo'

/** {@link MostWanted} with prices from the printings store. */
export interface WantedOverview extends MostWanted {
  /** Unit price: bundled basic lands are free; others at their cheapest non-foil printing. */
  unitOf: (card: WantedCard) => UnitPrice
  /** Printing a card is priced and pictured with. */
  printingOf: (card: WantedCard) => Printing | null
  /** Cost of every priced nonbasic card's missing copies. */
  total: number
  /** Nonbasic cards whose prices are still loading. */
  loading: number
}

/** Most Wanted cards; they change with the lists, inventory and copy claims, not with prices. */
const sharedWanted = memoLast(mostWanted)

/** Prices Most Wanted cards; recomputed when prices change. */
const sharedPricing = memoLast(
  (wanted: MostWanted, bundleBasics: boolean, priceBasis: PriceBasis, _version: number): WantedOverview => {
    const printingOf = (card: WantedCard) =>
      bundledBasic(card.name, bundleBasics)?.printing ?? cheapestVersion(card.name, priceBasis)?.printing ?? null
    const unitOf = (card: WantedCard): UnitPrice =>
      bundledBasic(card.name, bundleBasics) ? 0 : cheapestVersion(card.name, priceBasis)?.unit
    let total = 0
    let loading = 0
    for (const card of wanted.cards) {
      const cost = costOf(card, unitOf(card))
      if (typeof cost === 'number') total += cost
      else if (cost === undefined) loading += 1
    }
    return { ...wanted, unitOf, printingOf, total, loading }
  }
)

/**
 * Most Wanted cards of `lists` in the chosen copies mode, priced on the chosen basis; shared by the
 * sidebar and the Most Wanted page. Callers re-render on printings changes ({@link usePrintingsVersion}).
 * @param pool - Copy claims of `lists` ({@link useCopyPool}).
 */
export function wantedOverview(
  lists: CardList[],
  inventory: Map<string, InventoryItem>,
  { bundleBasics, priceBasis, copies }: Pick<AppSettings, 'bundleBasics' | 'priceBasis' | 'copies'>,
  pool: CopyPool
): WantedOverview {
  return sharedPricing(sharedWanted(lists, inventory, copies, pool), bundleBasics, priceBasis, getPrintingsVersion())
}
