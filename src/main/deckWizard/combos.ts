import { createHash } from 'node:crypto'
import { parseBracketFacts, parseComboSearch, type BracketFacts, type ComboSearch } from '@shared/deckWizard/combos'
import { cachedFetch } from '../cacheFiles'
import { wizardServices } from './services'
import { fetchJson } from '../http'

/**
 * Client for Commander Spellbook's API: the combos among a list of cards, and the facts the
 * Commander Brackets rules need. Answers are cached by card list for a week, and served stale
 * when the service can't be reached. Without any answer the result is null, and the wizard falls
 * back to what it reads from rules text.
 *
 * @packageDocumentation
 */

/** Most cards one request may send besides the commanders. */
export const MAX_SPELLBOOK_CARDS = 600
/** How long a cached answer is kept. */
const CACHE_MS = 7 * 24 * 60 * 60 * 1000
/** Cache folder under userData. */
const CACHE_DIR = 'spellbook'

/** Cache key of a request: the endpoint and its cards in any order. */
function keyOf(endpoint: string, commanders: string[], main: string[]): string {
  const cards = JSON.stringify([endpoint, [...commanders].sort(), [...main].sort()])
  return createHash('sha256').update(cards).digest('hex').slice(0, 32)
}

/** Posts a deck to an endpoint, cached; null when offline or on an unexpected answer. */
async function ask<T>(endpoint: string, commanders: string[], cards: string[], parse: (data: any) => T | null): Promise<T | null> {
  const main = cards.slice(0, MAX_SPELLBOOK_CARDS)
  try {
    return await cachedFetch(`${CACHE_DIR}/${keyOf(endpoint, commanders, main)}.json`, CACHE_MS, async () => {
      const body = { commanders: commanders.map((card) => ({ card })), main: main.map((card) => ({ card })) }
      const res = await fetchJson(`${wizardServices().spellbookApi}/${endpoint}`, 'Commander Spellbook', body)
      const data = res.status === 200 ? parse(res.data) : null
      if (data === null) throw new Error(`Commander Spellbook answered HTTP ${res.status}.`)
      return data
    })
  } catch {
    return null
  }
}

/** @returns The combos among the commanders and cards, and those one card away; null if unavailable. */
export function findCombos(commanders: string[], cards: string[]): Promise<ComboSearch | null> {
  return ask('find-my-combos', commanders, cards, (data) => parseComboSearch(data, [...commanders, ...cards]))
}

/** @returns Game Changers, land denial, extra turns and combos among the cards; null if unavailable. */
export function bracketFacts(commanders: string[], cards: string[]): Promise<BracketFacts | null> {
  return ask('estimate-bracket', commanders, cards, parseBracketFacts)
}
