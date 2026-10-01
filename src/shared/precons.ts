import { nameKey } from './decklist'
import { safeFileName } from './filenames'
import type { CardLine, PreconDeck } from './types'

export interface PreconOptions {
  /** Pin the exact printings (set, collector number, foil) the deck ships with. */
  exact: boolean
  skipBasics: boolean
}

export type PreconEntry = Omit<CardLine, 'id' | 'kind'>

/** Reversible Secret Lair cards are named "Command Tower // Command Tower"; keep one face. */
export function simplifyCardName(name: string): string {
  const faces = name.split(' // ')
  return faces.every((face) => face === faces[0]) ? faces[0] : name
}

/** Turns a decklist into list entries, merging duplicates (e.g. the same card in main deck and sideboard). */
export function preconEntries(deck: PreconDeck, options: PreconOptions): PreconEntry[] {
  const merged = new Map<string, PreconEntry>()
  for (const card of deck.cards) {
    if (options.skipBasics && card.basic) continue
    const entry: PreconEntry = options.exact
      ? { qty: card.qty, name: card.name, set: card.set, collector: card.collector, foil: card.foil }
      : { qty: card.qty, name: card.name, foil: false }
    const key = [nameKey(entry.name), entry.set ?? '', entry.collector ?? '', entry.foil].join('|')
    const existing = merged.get(key)
    if (existing) existing.qty += entry.qty
    else merged.set(key, entry)
  }
  return [...merged.values()]
}

/** A valid, unused list name for a deck, e.g. "Masters of the Universe - Sold Separately (2)". */
export function preconListName(deckName: string, existingNames: string[]): string {
  const base = safeFileName(deckName) || 'Precon'
  const taken = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const name = `${base} (${i})`
    if (!taken.has(name.toLowerCase())) return name
  }
}
