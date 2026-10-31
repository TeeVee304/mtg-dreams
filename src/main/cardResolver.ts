import { nameKey } from '@shared/decklist'
import type { CardQuery, ResolvedCard } from '@shared/types'
import { bareLetters, fetchCollection, findForeign, fuzzyNamed, type CollectionId, type Lookup, type NameMatch } from './scryfall'
import { cachedEntry, scryfallCache, scryfallCacheChanged, scryfallCacheReady } from './scryfallCache'

/**
 * The card resolver: turns what you have of a card into its English name. A name in any language
 * (search, imports), or a set code and collector number (imports, the Card Scanner). Answers come
 * from the Scryfall cache first, then from Scryfall through the same rate limiter as every other
 * call, and are kept in the same cache file.
 *
 * Names go, cheapest first: the cache; English names, 75 per request; printed names in other
 * languages, 20 per search; and fuzzy matches one at a time, last.
 *
 * @packageDocumentation
 */

/** Age after which an unknown query is asked again (a new card, or one Scryfall added later). */
const UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000
/** Lookups for a waiting player. */
const LOOKUP: Lookup = { priority: 'high' }

/** Cache key of a query. */
export function queryKey(query: CardQuery): string {
  return 'name' in query ? `name:${nameKey(query.name)}` : `print:${query.set.toLowerCase()}/${query.collector.toLowerCase()}`
}

/** @returns What a Scryfall match resolves to. */
function resolvedOf({ card, lang, fuzzy }: NameMatch): ResolvedCard {
  return { name: card.name, ...(lang && { lang }), ...(fuzzy && { fuzzy }) }
}

/** @returns Whether `card` is the one `name` names exactly: its full name or a face's, letters alike. */
function names(card: { name: string }, name: string): boolean {
  return [card.name, ...card.name.split(' // ')].some((other) => bareLetters(other) === bareLetters(name))
}

/**
 * @returns The cached answer to a query: an earlier answer, else what card lookups already know.
 * Undefined if nothing is known, or an unknown answer is old.
 */
function cachedAnswer(query: CardQuery, key: string, printing: () => Map<string, string>): ResolvedCard | null | undefined {
  const known = scryfallCache.resolved[key]
  if (known && (known.card || Date.now() - known.fetchedAt < UNKNOWN_TTL_MS)) return known.card
  if ('name' in query) {
    const entry = cachedEntry(nameKey(query.name))
    if (entry && !entry.notFound) {
      const exact = entry.lang !== undefined || names(entry, query.name)
      return { name: entry.name, ...(entry.lang && { lang: entry.lang }), ...(!exact && { fuzzy: true as const }) }
    }
    const info = scryfallCache.cards[nameKey(query.name)]
    return info && names(info.card, query.name) ? { name: info.card.name } : undefined
  }
  const name = printing().get(`${query.set.toLowerCase()}/${query.collector.toLowerCase()}`)
  return name ? { name, set: query.set.toLowerCase(), collector: query.collector } : undefined
}

/** @returns The cached printings' card names by `set/collector`, lower case. */
function printingIndex(): Map<string, string> {
  const index = new Map<string, string>()
  for (const entry of Object.values(scryfallCache.entries)) {
    for (const printing of entry.printings) index.set(`${printing.set}/${printing.collectorNumber.toLowerCase()}`, entry.name)
  }
  return index
}

/**
 * Resolves cards, each query once. Queries Scryfall can't answer now (offline) resolve to null and
 * are not cached, so they are asked again next time.
 * @returns A card per query, in order; null if unknown.
 */
export async function resolveCards(queries: CardQuery[]): Promise<(ResolvedCard | null)[]> {
  await scryfallCacheReady()
  const answers = new Map<string, ResolvedCard | null>()
  const missing = new Map<string, CardQuery>()
  let index: Map<string, string> | null = null
  const printing = () => (index ??= printingIndex())
  for (const query of queries) {
    const key = queryKey(query)
    if (answers.has(key) || missing.has(key)) continue
    const cached = cachedAnswer(query, key, printing)
    if (cached === undefined) missing.set(key, query)
    else answers.set(key, cached)
  }
  if (missing.size === 0) return queries.map((query) => answers.get(queryKey(query)) ?? null)

  const found = new Map<string, ResolvedCard | null>()
  try {
    // English names and printings, 75 a request.
    const asked = [...missing.values()]
    const ids: CollectionId[] = asked.map((query) =>
      'name' in query ? { name: query.name.split(' // ')[0] } : { set: query.set.toLowerCase(), collector_number: query.collector }
    )
    for (const card of await fetchCollection(ids, 'high')) {
      for (const query of asked) {
        const key = queryKey(query)
        if (found.has(key)) continue
        if ('name' in query ? names(card, query.name) : card.set === query.set.toLowerCase() && card.collector_number.toLowerCase() === query.collector.toLowerCase()) {
          found.set(key, 'name' in query ? { name: card.name } : { name: card.name, set: card.set, collector: card.collector_number })
        }
      }
    }
    // Names in other languages, then fuzzy matches; printings Scryfall doesn't know are unknown.
    const rest = asked.filter((query) => !found.has(queryKey(query)))
    const restNames = rest.flatMap((query) => ('name' in query ? [query.name] : []))
    const foreign = await findForeign(restNames, LOOKUP)
    for (const query of rest) {
      const key = queryKey(query)
      if (!('name' in query)) found.set(key, null)
      else if (foreign.has(bareLetters(query.name))) found.set(key, resolvedOf(foreign.get(bareLetters(query.name))!))
    }
    for (const query of rest) {
      const key = queryKey(query)
      if (found.has(key) || !('name' in query)) continue
      const named = await fuzzyNamed(query.name, LOOKUP)
      found.set(key, named ? resolvedOf(named) : null)
    }
  } catch {
    // Offline or refused: what was found is kept; the rest is asked again next time.
  }
  const now = Date.now()
  for (const [key, card] of found) {
    scryfallCache.resolved[key] = { fetchedAt: now, card }
    answers.set(key, card)
  }
  if (found.size > 0) scryfallCacheChanged()
  return queries.map((query) => answers.get(queryKey(query)) ?? null)
}
