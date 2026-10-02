import { nameKey } from './decklist'
import { safeFileName } from './filenames'
import type { CardLine, PreconDeck } from './types'

/** Precon import options. */
export interface PreconOptions {
  /** Pin shipped printings (set, collector number, foil). */
  exact: boolean
  /** Omit basic lands. */
  skipBasics: boolean
}

/** List line fields produced from a precon card. */
export type PreconEntry = Omit<CardLine, 'id' | 'kind'>

/** Collapses identical-face names (`X // X`, reversible cards) to `X`. */
export function simplifyCardName(name: string): string {
  const faces = name.split(' // ')
  return faces.every((face) => face === faces[0]) ? faces[0] : name
}

/** @returns List entries; duplicates across boards with the same name and printing are summed. */
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

/** @returns Sanitized list name, suffixed ` (n)` if taken (case-insensitive); `Precon` if empty. */
export function preconListName(deckName: string, existingNames: string[]): string {
  const base = safeFileName(deckName) || 'Precon'
  const taken = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const name = `${base} (${i})`
    if (!taken.has(name.toLowerCase())) return name
  }
}
