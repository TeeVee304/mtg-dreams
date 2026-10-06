import { nameKey } from './decklist'
import { FORMATS } from './formats'
import { cardImageUrl } from './images'
import type { CardInfo, CardLine, Printing } from './types'

/**
 * Generic basic lands for the `bundleBasics` setting: each of the five regular basics is one
 * zero-cost card, any printing, shown as its Foundations printing, never queried on Scryfall.
 * Wastes and snow-covered basics are excluded.
 *
 * @packageDocumentation
 */

/** Foundations printing of each regular basic. */
const DEFINITIONS = [
  { name: 'Plains', color: 'W', collector: '272', id: '4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3' },
  { name: 'Island', color: 'U', collector: '274', id: '17e2b637-72b1-4457-aaba-66d51107be4c' },
  { name: 'Swamp', color: 'B', collector: '276', id: '319bc1f0-ee42-44e5-b08b-735613ded2ba' },
  { name: 'Mountain', color: 'R', collector: '278', id: '279df7e2-2a3b-464a-a7df-e91da28e3a8c' },
  { name: 'Forest', color: 'G', collector: '280', id: 'd232fcc2-12f6-401a-b1aa-ddff11cb9378' }
]

/** Scryfall legalities of basics: legal in every format except Old School. */
const LEGALITIES = Object.fromEntries(FORMATS.map((f) => [f.id, f.id === 'oldschool' ? 'not_legal' : 'legal']))

/** Synthetic card data and printing of a generic basic. */
export interface GenericBasic {
  info: CardInfo
  printing: Printing
}

/** Generic basics by nameKey. */
const GENERIC = new Map<string, GenericBasic>(
  DEFINITIONS.map((d) => [
    nameKey(d.name),
    {
      info: {
        name: d.name,
        colors: [],
        colorIdentity: [d.color],
        typeLine: `Basic Land — ${d.name}`,
        manaValue: 0,
        rarity: 'common',
        legalities: LEGALITIES
      },
      printing: {
        id: d.id,
        name: d.name,
        set: 'fdn',
        setName: 'Foundations',
        collectorNumber: d.collector,
        rarity: 'common',
        releasedAt: '2024-11-15',
        lang: 'en',
        finishes: ['nonfoil', 'foil'],
        cardmarketId: null,
        price: { trend: 0 },
        priceFoil: { trend: 0 },
        imageSmall: cardImageUrl(d.id, 'small'),
        imageNormal: cardImageUrl(d.id, 'normal'),
        imageBack: null,
        cardmarketUrl: null,
        labels: [],
        autoEligible: true
      }
    }
  ])
)

/** @returns Generic card for a regular basic; undefined otherwise. */
export function genericBasic(name: string): GenericBasic | undefined {
  return GENERIC.get(nameKey(name))
}

/** @returns Generic card if `bundleBasics` is on and `name` is a regular basic; undefined otherwise. */
export function bundledBasic(name: string, bundleBasics: boolean): GenericBasic | undefined {
  return bundleBasics ? genericBasic(name) : undefined
}

/** Display line, possibly merged from several file lines. */
export interface BundledLine {
  line: CardLine
  /** Ids of the merged file lines; absent for unmerged lines. */
  bundledIds?: string[]
}

/**
 * Merges all lines of each regular basic (any printing or finish) into one non-foil line
 * with id `<idPrefix><nameKey>`, at the position of its first occurrence. Other lines pass through.
 * @param idPrefix - Distinguishes bundles of separately bundled line sets (main deck, sideboard).
 */
export function bundleBasicLines(lines: CardLine[], idPrefix = 'basic:'): BundledLine[] {
  const result: BundledLine[] = []
  const bundles = new Map<string, BundledLine & { bundledIds: string[] }>()
  for (const line of lines) {
    const generic = genericBasic(line.name)
    if (!generic) {
      result.push({ line })
      continue
    }
    const key = nameKey(line.name)
    const bundle = bundles.get(key)
    if (bundle) {
      bundle.line = { ...bundle.line, qty: bundle.line.qty + line.qty }
      bundle.bundledIds.push(line.id)
    } else {
      const created = {
        line: { kind: 'card' as const, id: `${idPrefix}${key}`, qty: line.qty, name: generic.info.name, foil: false },
        bundledIds: [line.id]
      }
      bundles.set(key, created)
      result.push(created)
    }
  }
  return result
}
