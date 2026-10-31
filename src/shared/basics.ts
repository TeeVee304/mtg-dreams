import { nameKey } from './decklist'
import { FORMATS } from './formats'
import { cardImageUrl } from './images'
import type { CardInfo, CardLine, Printing } from './types'

/**
 * Generic basic lands for the `bundleBasics` setting: each regular basic (the five, and Wastes) is
 * one zero-cost card, any printing, shown as one printing of it, never queried on Scryfall.
 * Snow-covered basics are excluded.
 *
 * @packageDocumentation
 */

/** Foundations, where the five basics are. */
const FOUNDATIONS = { set: 'fdn', setName: 'Foundations', releasedAt: '2024-11-15' }

/** The printing shown for each regular basic: Foundations for the five, Modern Horizons 3 Commander for Wastes. */
const DEFINITIONS = [
  { name: 'Plains', colors: ['W'], subtype: true, collector: '272', id: '4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3', ...FOUNDATIONS },
  { name: 'Island', colors: ['U'], subtype: true, collector: '274', id: '17e2b637-72b1-4457-aaba-66d51107be4c', ...FOUNDATIONS },
  { name: 'Swamp', colors: ['B'], subtype: true, collector: '276', id: '319bc1f0-ee42-44e5-b08b-735613ded2ba', ...FOUNDATIONS },
  { name: 'Mountain', colors: ['R'], subtype: true, collector: '278', id: '279df7e2-2a3b-464a-a7df-e91da28e3a8c', ...FOUNDATIONS },
  { name: 'Forest', colors: ['G'], subtype: true, collector: '280', id: 'd232fcc2-12f6-401a-b1aa-ddff11cb9378', ...FOUNDATIONS },
  // Colorless, and with no land type.
  {
    name: 'Wastes',
    colors: [],
    subtype: false,
    collector: '408',
    id: '475be6db-6541-412b-a07e-5357b25a499f',
    set: 'm3c',
    setName: 'Modern Horizons 3 Commander',
    releasedAt: '2024-06-14'
  }
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
        colorIdentity: d.colors,
        typeLine: d.subtype ? `Basic Land — ${d.name}` : 'Basic Land',
        manaValue: 0,
        rarity: 'common',
        legalities: LEGALITIES,
        produces: d.colors.length > 0 ? d.colors : ['C']
      },
      printing: {
        id: d.id,
        name: d.name,
        set: d.set,
        setName: d.setName,
        collectorNumber: d.collector,
        rarity: 'common',
        releasedAt: d.releasedAt,
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
