import { nameKey } from './decklist'
import { exclusion, slotScore, type CandidatePool, type PoolCard, type Ranked } from './deckPool'
import type { CardProfile } from './mechanics'
import type { LibraryCard } from './types'

/**
 * Searching the cards a deck may play, and looking cards up by name, so Claude can choose beyond
 * the shortlist without ever picking a card the deck may not play.
 *
 * @packageDocumentation
 */

/** A search of the eligible cards. */
export interface CardSearch {
  /** Words that must all appear in the name, type line or rules text; `"…"` for an exact phrase. */
  text?: string
  /** Slot id to rank by; only cards that do its job are found. */
  slot?: string
  /** Type the card must have, e.g. `Creature`. */
  type?: string
  maxPrice?: number
  maxManaValue?: number
  /** Most results, 1 to {@link MAX_RESULTS}. */
  limit?: number
}

/** Results of a search. */
export interface SearchResult {
  cards: Ranked[]
  /** Matches in all, before the limit. */
  total: number
}

/** Results returned without a limit. */
const DEFAULT_RESULTS = 15
/** Most results returned. */
export const MAX_RESULTS = 30

/** Search terms: quoted phrases and single words, lower case. */
function terms(text: string): string[] {
  return [...text.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)].map((m) => (m[1] ?? m[2]).trim()).filter(Boolean)
}

/**
 * Searches the eligible cards, best first: by their score for `slot` when given, otherwise by how
 * strongly they connect to the commander and key cards, then cheapest.
 * @param exclude - Name keys to leave out, e.g. cards already in the deck.
 * @throws Error naming the valid slots when `slot` isn't one of the plan's.
 */
export function searchPool(pool: CandidatePool, search: CardSearch, exclude: Set<string> = new Set()): SearchResult {
  const slot = search.slot ? pool.template.slots.find((s) => s.id === search.slot) : undefined
  if (search.slot && !slot) throw new Error(`There is no slot “${search.slot}”. Slots: ${pool.template.slots.map((s) => s.id).join(', ')}.`)
  const words = terms(search.text ?? '')
  const type = search.type?.toLowerCase()
  const found: Ranked[] = []
  for (const [key, entry] of pool.eligible) {
    const { card } = entry
    if (exclude.has(key)) continue
    if (search.maxPrice !== undefined && (entry.price ?? 0) > search.maxPrice) continue
    if (search.maxManaValue !== undefined && card.manaValue > search.maxManaValue) continue
    if (type && !card.typeLine.toLowerCase().includes(type)) continue
    const haystack = `${card.name}\n${card.typeLine}\n${card.text}`.toLowerCase()
    if (!words.every((word) => haystack.includes(word))) continue
    const score = slot ? slotScore(slot, entry, pool) : entry.synergy
    if (score !== null) found.push({ entry, score })
  }
  found.sort((a, b) => b.score - a.score || (a.entry.price ?? 0) - (b.entry.price ?? 0) || a.entry.card.name.localeCompare(b.entry.card.name))
  const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(search.limit ?? DEFAULT_RESULTS)))
  return { cards: found.slice(0, limit), total: found.length }
}

/** A card looked up by name: eligible, or why not. */
export type LookUp = { name: string; entry: PoolCard } | { name: string; reason: string }

/**
 * Looks cards up by name in the whole card library.
 * @param find - Library card and what it does, by name; undefined if unknown.
 * @param price - Price on the brief's basis.
 * @returns For each name: the eligible card, or why it can't be picked, in plain words.
 */
export function lookUpCards(
  names: string[],
  pool: CandidatePool,
  find: (name: string) => { card: LibraryCard; profile: CardProfile } | undefined,
  price: (card: LibraryCard) => number | null
): LookUp[] {
  return names.map((name) => {
    const known = find(name)
    if (!known) return { name, reason: `“${name}” isn't a card MTG Dreams knows. Use its exact English name.` }
    const entry = pool.eligible.get(nameKey(known.card.name))
    if (entry) return { name: known.card.name, entry }
    const out = exclusion(known.card, known.profile, price(known.card), pool)
    return { name: known.card.name, reason: out?.message ?? `${known.card.name} can't be picked for this deck.` }
  })
}
