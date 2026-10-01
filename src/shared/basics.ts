import { nameKey } from './decklist'
import { FORMATS } from './formats'
import { cardImageUrl } from './images'
import type { CardInfo, CardLine, Printing } from './types'

// With "Bundle basic lands" on (the default), the five regular basics count as
// one generic card each, whatever their version: shown with a Foundations
// printing, never looked up on Scryfall, and counted as free. Wastes and
// snow-covered basics are left alone (snow matters to snow decks).

const DEFINITIONS = [
  { name: 'Plains', color: 'W', collector: '272', id: '4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3' },
  { name: 'Island', color: 'U', collector: '274', id: '17e2b637-72b1-4457-aaba-66d51107be4c' },
  { name: 'Swamp', color: 'B', collector: '276', id: '319bc1f0-ee42-44e5-b08b-735613ded2ba' },
  { name: 'Mountain', color: 'R', collector: '278', id: '279df7e2-2a3b-464a-a7df-e91da28e3a8c' },
  { name: 'Forest', color: 'G', collector: '280', id: 'd232fcc2-12f6-401a-b1aa-ddff11cb9378' }
]

// As Scryfall reports them: legal everywhere but Old School (original printings only).
const LEGALITIES = Object.fromEntries(FORMATS.map((f) => [f.id, f.id === 'oldschool' ? 'not_legal' : 'legal']))

export interface GenericBasic {
  info: CardInfo
  printing: Printing
}

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
        // Bundled basics are free, whatever the price basis (it falls back to the trend).
        price: { trend: 0 },
        priceFoil: { trend: 0 },
        imageSmall: cardImageUrl(d.id, 'small'),
        imageNormal: cardImageUrl(d.id, 'normal'),
        cardmarketUrl: null,
        labels: [],
        autoEligible: true
      }
    }
  ])
)

/** The generic card for Plains, Island, Swamp, Mountain or Forest; undefined for anything else. */
export function genericBasic(name: string): GenericBasic | undefined {
  return GENERIC.get(nameKey(name))
}

/** The generic card when basic lands are bundled (the setting) and this is one of the five; else undefined. */
export function bundledBasic(name: string, bundleBasics: boolean): GenericBasic | undefined {
  return bundleBasics ? genericBasic(name) : undefined
}

export interface BundledLine {
  line: CardLine
  /** Ids of the file lines merged into this one; absent for ordinary lines. */
  bundledIds?: string[]
}

/**
 * Merges every line of each regular basic land (any version or finish) into one
 * plain line, placed where that land first appears. Other lines are unchanged.
 */
export function bundleBasicLines(lines: CardLine[]): BundledLine[] {
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
        line: { kind: 'card' as const, id: `basic:${key}`, qty: line.qty, name: generic.info.name, foil: false },
        bundledIds: [line.id]
      }
      bundles.set(key, created)
      result.push(created)
    }
  }
  return result
}
