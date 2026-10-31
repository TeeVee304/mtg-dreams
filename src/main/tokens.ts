/**
 * Token data for lists: each card's created parts (Scryfall `all_parts`) and the token cards
 * themselves, cached in userData. Card links refresh weekly; a stale cache is served offline.
 *
 * @packageDocumentation
 */

import { nameKey } from '@shared/decklist'
import { partKind, type DeckTokenData, type TokenInfo, type TokenRef } from '@shared/tokens'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { backImageOf, fetchCollection, searchTokenVersions } from './scryfall'

/** Cache file name. */
const FILE = 'token-cache.json'

/**
 * Cache schema version; 3 added the face-down helpers (Morph, A Mysterious Creature…), 4 tokens' oracle
 * ids and sets, 5 the helpers found by rules text.
 */
const VERSION = 5

/** Card link TTL. */
const LINKS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** On-disk cache. */
interface TokenCache {
  version: number
  /** Created parts per card nameKey, with fetch time; empty for cards making nothing or unknown. */
  cards: Record<string, { at: number; parts: TokenRef[] }>
  /** Token cards by id. */
  tokens: Record<string, TokenInfo>
  /** Versions of a token per oracle id, newest first, with fetch time. */
  versions?: Record<string, { at: number; ids: string[] }>
}

/** In-memory cache. */
let cache: TokenCache | null = null

/** Serializes lookups so concurrent requests don't fetch the same cards twice. */
let queue: Promise<unknown> = Promise.resolve()

/** @returns The cache, loaded once; invalid files reset to empty. */
async function load(): Promise<TokenCache> {
  if (cache) return cache
  const file = await readCacheFile<TokenCache>(FILE)
  cache = file?.version === VERSION && file.cards && file.tokens ? file : { version: VERSION, cards: {}, tokens: {} }
  return cache
}

/** Color letters in WUBRG order. */
const sortColors = (colors: string[]) => [...colors].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b))

/** Maps a Scryfall token object; double-faced tokens use their front face. */
function toTokenInfo(card: any): TokenInfo {
  const face = card.card_faces?.[0] ?? {}
  const images = card.image_uris ?? face.image_uris ?? {}
  const pick = (key: string) => card[key] ?? face[key]
  return {
    id: card.id,
    name: card.name,
    typeLine: pick('type_line') ?? '',
    ...(pick('power') !== undefined && { power: String(pick('power')) }),
    ...(pick('toughness') !== undefined && { toughness: String(pick('toughness')) }),
    colors: sortColors(pick('colors') ?? []),
    text: pick('oracle_text') ?? '',
    imageSmall: images.small?.split('?')[0] ?? null,
    imageNormal: images.normal?.split('?')[0] ?? null,
    imageBack: backImageOf(card),
    ...(card.oracle_id && { oracleId: card.oracle_id }),
    set: card.set,
    setName: card.set_name,
    collector: card.collector_number
  }
}

/**
 * Helper cards that Scryfall doesn't link from every card using them, found by rules text instead:
 * The Monarch (Black Panther's Wakandans, "if you're the monarch" cards), by its Scryfall id.
 */
const TEXT_HELPERS: { text: RegExp; id: string }[] = [{ text: /\bthe monarch\b/i, id: 'fca6ceed-a7d3-47a2-bb0d-7582e596c1f6' }]

/** @returns Created parts of a card from its `all_parts`, excluding the card itself, and {@link TEXT_HELPERS}. */
function partsOf(card: any): TokenRef[] {
  const parts: TokenRef[] = []
  for (const part of card.all_parts ?? []) {
    const kind = partKind(String(part?.component ?? ''), String(part?.type_line ?? ''))
    if (kind && part.id && part.id !== card.id && !parts.some((p) => p.id === part.id)) parts.push({ id: part.id, kind })
  }
  const text: string = card.oracle_text ?? (card.card_faces ?? []).map((face: any) => face.oracle_text ?? '').join('\n')
  for (const helper of TEXT_HELPERS) {
    if (helper.text.test(text) && !parts.some((p) => p.id === helper.id)) parts.push({ id: helper.id, kind: 'helper' })
  }
  return parts
}

/**
 * Fetches links for cards missing or stale in the cache, then any unknown token cards.
 * @param chosen - Token ids a list chose ({@link getDeckTokens}), fetched too.
 */
async function refresh(names: string[], chosen: string[]): Promise<void> {
  const store = await load()
  const now = Date.now()
  const stale = names.filter((name) => !(now - (store.cards[nameKey(name)]?.at ?? 0) < LINKS_TTL_MS))
  let changed = false
  if (stale.length > 0) {
    const found = await fetchCollection(stale.map((name) => ({ name: name.split(' // ')[0] })))
    const byKey = new Map(found.map((card) => [nameKey(card.name), card]))
    for (const name of stale) {
      const card = byKey.get(nameKey(name))
      store.cards[nameKey(name)] = { at: now, parts: card ? partsOf(card) : [] }
    }
    changed = true
  }
  const missing = [...new Set([...names.flatMap((name) => store.cards[nameKey(name)]?.parts ?? []).map((p) => p.id), ...chosen])].filter(
    (id) => !store.tokens[id]
  )
  if (missing.length > 0) {
    for (const card of await fetchCollection(missing.map((id) => ({ id })))) store.tokens[card.id] = toTokenInfo(card)
    changed = true
  }
  // Awaited inside the queue, so writes never overlap and a resolved lookup is on disk.
  if (changed) await writeCacheFile(FILE, store)
}

/**
 * Collects token data for a list. Never rejects: on failure, cached data is used, and
 * `available` is false only if nothing is cached for these cards.
 * @param names - Card names (main deck).
 * @param chosen - Token Versions the list chose: their ids, returned among the tokens.
 */
export async function getDeckTokens(names: string[], chosen: string[] = []): Promise<DeckTokenData> {
  const unique = [...new Set(names)]
  const run = queue.then(() => refresh(unique, chosen))
  queue = run.catch(() => undefined)
  const ok = await run.then(
    () => true,
    () => false
  )
  const store = await load()
  const makers: DeckTokenData['makers'] = {}
  const tokens: DeckTokenData['tokens'] = {}
  let known = false
  for (const name of unique) {
    const entry = store.cards[nameKey(name)]
    if (!entry) continue
    known = true
    makers[name] = entry.parts.filter((part) => store.tokens[part.id])
    for (const part of makers[name]) tokens[part.id] = store.tokens[part.id]
  }
  for (const id of chosen) if (store.tokens[id]) tokens[id] = store.tokens[id]
  return { makers, tokens, available: ok || known }
}

/** @returns Scryfall ids of every cached token, whose saved images stay (see `cardImages`). */
export async function cachedTokenIds(): Promise<string[]> {
  return Object.keys((await load()).tokens)
}

/**
 * Lists the Versions of a token, newest first, refreshed weekly; cached ones offline. Never rejects.
 * @param oracleId - The token's Scryfall oracle id.
 */
export async function getTokenVersions(oracleId: string): Promise<TokenInfo[]> {
  const store = await load()
  const known = store.versions?.[oracleId]
  if (!known || Date.now() - known.at >= LINKS_TTL_MS) {
    const run = queue.then(async () => {
      const cards = await searchTokenVersions(oracleId)
      if (cards.length === 0) return
      for (const card of cards) store.tokens[card.id] = toTokenInfo(card)
      store.versions = { ...store.versions, [oracleId]: { at: Date.now(), ids: cards.map((card) => card.id) } }
      await writeCacheFile(FILE, store)
    })
    queue = run.catch(() => undefined)
    await run.catch(() => undefined)
  }
  return (store.versions?.[oracleId]?.ids ?? []).flatMap((id) => (store.tokens[id] ? [store.tokens[id]] : []))
}
