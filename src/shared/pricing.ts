import type { CardLine, PriceBasis, Prices, Printing } from './types'

/** Max age of cached printings (1 week). Prices are refreshed separately from Cardmarket's daily price guide. */
export const PRINTINGS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Selectable price bases with UI label and hint. */
export const PRICE_BASES: Array<{ id: PriceBasis; label: string; hint: string }> = [
  { id: 'trend', label: 'Typical', hint: 'What copies usually sell for: Cardmarket’s price trend.' },
  { id: 'low', label: 'Lowest listing', hint: 'The cheapest copy on offer, in any condition or language.' },
  { id: 'avg30', label: '30-day average', hint: 'What copies sold for over the last month: steadier.' }
]

/** Default price basis. */
export const DEFAULT_PRICE_BASIS: PriceBasis = 'trend'

/** Default wishlist price-drop alert threshold, in percent. */
export const DEFAULT_DROP_ALERT_PERCENT = 15

/** Type guard for {@link PriceBasis}. */
export function isPriceBasis(value: unknown): value is PriceBasis {
  return PRICE_BASES.some((basis) => basis.id === value)
}

/** "€12.50": for messages written outside the window, which formats prices in the player's own locale. */
export const eurText = (value: number) => `€${value.toFixed(2)}`

/** @returns UI label of `basis`. */
export function priceBasisLabel(basis: PriceBasis): string {
  return PRICE_BASES.find((option) => option.id === basis)?.label ?? basis
}

/** @returns Price on `basis`, falling back to `trend`; null if neither is known. */
export function pick(prices: Prices, basis: PriceBasis): number | null {
  return prices[basis] ?? prices.trend ?? null
}

/** Printing has a foil or etched finish. */
export const hasFoil = (printing: Printing) => printing.finishes.includes('foil') || printing.finishes.includes('etched')
/** Printing has a non-foil finish. */
export const hasNonfoil = (printing: Printing) => printing.finishes.includes('nonfoil')
/** Printing exists in one finish only, which fixes the foil choice. */
export const singleFinish = (printing: Printing) => !(hasFoil(printing) && hasNonfoil(printing))
/** @returns `foil` coerced to a finish the printing has. */
export const finishFor = (printing: Printing, foil: boolean) => (!hasNonfoil(printing) ? true : !hasFoil(printing) ? false : foil)

/**
 * @param foil - Requested finish. Non-foil requests on foil-only printings use the foil price.
 * @returns EUR price; null if unknown.
 */
export function priceOf(printing: Printing, foil: boolean, basis: PriceBasis): number | null {
  return !foil && hasNonfoil(printing) ? pick(printing.price, basis) : pick(printing.priceFoil, basis)
}

/** @returns Cheapest priced printing and its price; null if none is priced. */
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

/** Printing and price a list line resolves to. */
export interface Resolution {
  /** Printing used for price and preview. */
  printing: Printing | null
  unitPrice: number | null
  /** Line specifies a set. */
  pinned: boolean
  /** Specified set has no printing of this card. */
  pinMissing: boolean
  /** Numeric collector tag not found in the set; cheapest printing in the set is used. */
  collectorMissing: boolean
  /** Unpinned line resolved to the owned printing. */
  fromInventory?: boolean
}

/**
 * Resolves a line to a printing. Pinned: cheapest matching set and collector tag; non-numeric
 * tags (e.g. `<borderless>`) are ignored. Unpinned: cheapest `autoEligible` printing.
 * Without any price, falls back to the first candidate for preview.
 * @param printings - Card printings, newest first.
 */
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
  return { printing: printings[0] ?? null, unitPrice: null, pinned: false, pinMissing: false, collectorMissing: false }
}

/** @returns Copy sorted cheapest first, unpriced last, newest first on ties. */
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
