import type { CardLine, PriceBasis, Prices, Printing } from './types'

/**
 * A card's printings (its versions) only change when new sets come out, so the
 * cached list is refreshed weekly. Prices come separately, from Cardmarket's daily price guide.
 */
export const PRINTINGS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** The price a card is valued at (Settings → Prices). One choice for the whole app. */
export const PRICE_BASES: Array<{ id: PriceBasis; label: string; hint: string }> = [
  { id: 'trend', label: 'Typical', hint: 'What copies usually sell for: Cardmarket’s price trend.' },
  { id: 'low', label: 'Lowest listing', hint: 'The cheapest copy on offer, in any condition or language.' },
  { id: 'avg30', label: '30-day average', hint: 'What copies sold for over the last month: steadier.' }
]

export const DEFAULT_PRICE_BASIS: PriceBasis = 'trend'

/** A wishlist card is flagged once its price falls this many percent below its price when added. */
export const DEFAULT_DROP_ALERT_PERCENT = 15

export function isPriceBasis(value: unknown): value is PriceBasis {
  return PRICE_BASES.some((basis) => basis.id === value)
}

/** "Typical", "Lowest listing" or "30-day average", for notes about how cards are priced. */
export function priceBasisLabel(basis: PriceBasis): string {
  return PRICE_BASES.find((option) => option.id === basis)?.label ?? basis
}

/** A price on the chosen basis, or the trend when that one isn't known. */
export function pick(prices: Prices, basis: PriceBasis): number | null {
  return prices[basis] ?? prices.trend ?? null
}

/**
 * EUR price of buying this printing. A non-foil request on a foil-only
 * printing uses the foil price, since that is the only way to buy it.
 */
export function priceOf(printing: Printing, foil: boolean, basis: PriceBasis): number | null {
  if (foil) return pick(printing.priceFoil, basis)
  if (printing.finishes.includes('nonfoil')) return pick(printing.price, basis)
  return pick(printing.priceFoil, basis)
}

export function cheapestPrinting(
  printings: Printing[],
  foil: boolean,
  basis: PriceBasis
): { printing: Printing; price: number } | null {
  let best: { printing: Printing; price: number } | null = null
  for (const printing of printings) {
    const price = priceOf(printing, foil, basis)
    if (price === null) continue
    if (!best || price < best.price) best = { printing, price }
  }
  return best
}

export interface Resolution {
  /** The printing this line is priced and previewed with. */
  printing: Printing | null
  unitPrice: number | null
  pinned: boolean
  /** The line names a set/collector number that Scryfall doesn't list for this card. */
  pinMissing: boolean
  /** The set exists but the `<...>` collector number doesn't, so the cheapest in the set is used. */
  collectorMissing: boolean
  /** The line names no version, so it shows (and is priced at) the version you own. */
  fromInventory?: boolean
}

export function resolveLine(
  line: Pick<CardLine, 'set' | 'collector' | 'foil'>,
  printings: Printing[],
  basis: PriceBasis
): Resolution {
  if (line.set) {
    let candidates = printings.filter((p) => p.set === line.set)
    let collectorMissing = false
    if (line.collector) {
      const tag = line.collector.toLowerCase()
      const exact = candidates.filter((p) => p.collectorNumber.toLowerCase() === tag)
      if (exact.length > 0) candidates = exact
      // Goldfish tags can also be words like <borderless>; only digits imply a collector number.
      else collectorMissing = /\d/.test(tag)
    }
    if (candidates.length === 0) {
      return { printing: null, unitPrice: null, pinned: true, pinMissing: true, collectorMissing: false }
    }
    const best = cheapestPrinting(candidates, line.foil, basis)
    return best
      ? { printing: best.printing, unitPrice: best.price, pinned: true, pinMissing: false, collectorMissing }
      : { printing: candidates[0], unitPrice: null, pinned: true, pinMissing: false, collectorMissing }
  }

  const best = cheapestPrinting(
    printings.filter((p) => p.autoEligible),
    line.foil,
    basis
  )
  if (best) {
    return { printing: best.printing, unitPrice: best.price, pinned: false, pinMissing: false, collectorMissing: false }
  }
  // Nothing priced: still show the newest printing's image.
  return { printing: printings[0] ?? null, unitPrice: null, pinned: false, pinMissing: false, collectorMissing: false }
}

/** Order for the version picker: cheapest first, unpriced last, newest first on ties. */
export function sortPrintings(printings: Printing[], foil: boolean, basis: PriceBasis): Printing[] {
  return [...printings].sort((a, b) => {
    const pa = priceOf(a, foil, basis)
    const pb = priceOf(b, foil, basis)
    if (pa !== pb) {
      if (pa === null) return 1
      if (pb === null) return -1
      return pa - pb
    }
    return b.releasedAt.localeCompare(a.releasedAt)
  })
}
