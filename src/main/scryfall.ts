import type { PrintingsOptions } from '@shared/api'
import { isBasicLand } from '@shared/cards'
import { nameKey } from '@shared/decklist'
import { hasNamedCard, printingsOfNamedCard } from '@shared/matching'
import type { CardInfo, Prices, Printing, PrintingsResult } from '@shared/types'
import { env } from './environment'
import { fetchJson } from './http'
import { scryfallCache, scryfallCacheChanged, scryfallCacheReady } from './scryfallCache'

/** Card data TTL; changes only with bans and errata. */
const CARD_INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Max identifiers per `/cards/collection` request. */
const COLLECTION_BATCH = 75
/** Max search result pages (175 cards each) per lookup. */
const MAX_SEARCH_PAGES = 10

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Global lockout end (epoch ms) after a 429; Scryfall locks clients out for 30 s, so all queues
 * pause until then.
 */
let blockedUntil = 0

/** Queued request with its promise settlers. */
interface Job {
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

/**
 * Serial request queue with a minimum interval between starts and two priority lanes.
 * Honors the global 429 lockout.
 */
export class RateLimitedQueue {
  private readonly high: Job[] = []
  private readonly low: Job[] = []
  private running = false
  private nextSlot = 0

  /** @param intervalMs - Minimum delay between request starts. */
  constructor(private readonly intervalMs: number) {}

  /**
   * Enqueues a task.
   * @returns Task result promise and the job handle (for {@link RateLimitedQueue.promote}).
   */
  run<T>(task: () => Promise<T>, priority: 'high' | 'low'): { promise: Promise<T>; job: Job } {
    let job!: Job
    const promise = new Promise<T>((resolve, reject) => {
      job = { task, resolve: resolve as (value: unknown) => void, reject }
    })
    ;(priority === 'high' ? this.high : this.low).push(job)
    void this.pump()
    return { promise, job }
  }

  /** Moves a queued low-priority job to the high-priority lane; no-op if not queued. */
  promote(job: Job): void {
    const index = this.low.indexOf(job)
    if (index >= 0) {
      this.low.splice(index, 1)
      this.high.push(job)
    }
  }

  /** Drains the queue, high lane first; single runner. */
  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (;;) {
        const job = this.high.shift() ?? this.low.shift()
        if (!job) break
        const wait = Math.max(this.nextSlot, blockedUntil) - Date.now()
        if (wait > 0) await sleep(wait)
        this.nextSlot = Date.now() + this.intervalMs
        try {
          job.resolve(await job.task())
        } catch (error) {
          job.reject(error)
        }
      }
    } finally {
      this.running = false
    }
  }
}

/** Queue for `/cards/search`, `/cards/named` and `/cards/collection` (Scryfall limit: 2 req/s). */
const searchQueue = new RateLimitedQueue(550)
/** Queue for other endpoints (Scryfall limit: 10 req/s). */
const generalQueue = new RateLimitedQueue(120)

/**
 * GETs JSON, or POSTs `body`. Retries once after a 429 lockout.
 * @returns Parsed body; null on 404.
 * @throws Error on a repeated 429, other HTTP errors, or non-JSON bodies.
 */
async function getJson(url: string, body?: unknown): Promise<any | null> {
  for (let attempt = 0; ; attempt++) {
    const wait = blockedUntil - Date.now()
    if (wait > 0) await sleep(wait)
    const res = await fetchJson(url, 'Scryfall', body)
    if (res.status === 429) {
      blockedUntil = Date.now() + 31_000
      if (attempt === 0) continue
      throw new Error('Scryfall rate limit hit; try again in a minute.')
    }
    if (res.status === 404) return null
    if (res.status >= 400 || res.data === null) throw new Error(`Scryfall responded with HTTP ${res.status}.`)
    return res.data
  }
}

/** Parses a Scryfall price string; null if absent or invalid. */
function parsePrice(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/** Wraps a Scryfall EUR price as a `trend`-only {@link Prices}. */
function trendOnly(value: unknown): Prices {
  const price = parsePrice(value)
  return price === null ? {} : { trend: price }
}

/** Derives display labels (frame, finish, promo, border, language, flavor name) from a Scryfall card. */
function labelsFor(card: any): string[] {
  const labels: string[] = []
  const effects: string[] = card.frame_effects ?? []
  const promoTypes: string[] = card.promo_types ?? []
  if (card.border_color === 'borderless') labels.push('Borderless')
  if (effects.includes('showcase')) labels.push('Showcase')
  if (effects.includes('extendedart')) labels.push('Extended art')
  if (card.full_art) labels.push('Full art')
  if (card.textless) labels.push('Textless')
  if (effects.includes('etched') || (card.finishes ?? []).includes('etched')) labels.push('Etched')
  if (promoTypes.includes('serialized')) labels.push('Serialized')
  if (card.promo) labels.push('Promo')
  if (card.border_color === 'white') labels.push('White border')
  if (card.border_color === 'gold') labels.push('Gold border')
  if (card.set_type === 'memorabilia') labels.push('Not tournament legal')
  if (card.lang && card.lang !== 'en') labels.push(String(card.lang).toUpperCase())
  const flavorName = flavorNameOf(card)
  if (flavorName) labels.push(`Printed as “${flavorName}”`)
  return labels
}

/** Flavor name of the card or its first face. */
function flavorNameOf(card: any): string | undefined {
  return card.flavor_name ?? card.card_faces?.[0]?.flavor_name ?? undefined
}

/**
 * Maps a Scryfall card to a {@link Printing}. Scryfall EUR prices (Cardmarket trend) become the
 * fallback for guide prices; image URLs drop the `?version` query.
 */
/** Back face image (normal size) of a card whose faces carry their own images; null otherwise. */
export function backImageOf(card: any): string | null {
  return card.image_uris ? null : (card.card_faces?.[1]?.image_uris?.normal?.split('?')[0] ?? null)
}

function toPrinting(card: any): Printing {
  const images = card.image_uris ?? card.card_faces?.[0]?.image_uris ?? {}
  return {
    id: card.id,
    name: card.name,
    set: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    releasedAt: card.released_at ?? '',
    lang: card.lang ?? 'en',
    finishes: card.finishes ?? [],
    cardmarketId: Number.isSafeInteger(card.cardmarket_id) ? card.cardmarket_id : null,
    price: trendOnly(card.prices?.eur),
    priceFoil: trendOnly(card.prices?.eur_foil),
    imageSmall: images.small?.split('?')[0] ?? null,
    imageNormal: images.normal?.split('?')[0] ?? null,
    imageBack: backImageOf(card),
    cardmarketUrl: card.purchase_uris?.cardmarket ?? null,
    labels: labelsFor(card),
    autoEligible: card.border_color !== 'gold' && card.set_type !== 'memorabilia',
    ...(flavorNameOf(card) && { flavorName: flavorNameOf(card) })
  }
}

/** Rules text overriding the copy limit ("any number of" / "up to N"). */
const DECK_LIMIT_RE = /A deck can have (?:any number of|up to (\w+)) cards named/i
/** Number words used in {@link DECK_LIMIT_RE}. */
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
/** Rules text letting a noncreature card be commander: "can be your commander", or creature off the battlefield (Grist). */
const LEADS_RE = /can be your commander|isn't on the battlefield, it's an? [^.]*\bcreature\b/i

/** Maps a Scryfall card to {@link CardInfo}; colors fall back to the union of face colors, sorted WUBRG. */
function toCardInfo(card: any): CardInfo {
  const faces: any[] = card.card_faces ?? []
  const colors: string[] = card.colors ?? [...new Set(faces.flatMap((face) => face.colors ?? []))]
  const text: string = card.oracle_text ?? faces.map((face) => face.oracle_text ?? '').join('\n')
  const limit = DECK_LIMIT_RE.exec(text)
  let deckLimit: CardInfo['deckLimit']
  if (limit) {
    const n = limit[1] ? (NUMBER_WORDS[limit[1].toLowerCase()] ?? Number(limit[1])) : Infinity
    deckLimit = Number.isFinite(n) ? n : 'any'
  }
  return {
    name: card.name,
    colors: colors.sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)),
    colorIdentity: card.color_identity ?? [],
    typeLine: card.type_line ?? faces.map((face) => face.type_line ?? '').join(' // '),
    manaValue: card.cmc ?? 0,
    rarity: card.rarity ?? 'common',
    legalities: card.legalities ?? {},
    ...(deckLimit !== undefined && { deckLimit }),
    ...(LEADS_RE.test(text) && { canBeCommander: true as const })
  }
}

/** Lookup state; `queued` is the currently queued job, for promotion. */
interface Lookup {
  priority: 'high' | 'low'
  queued?: Job
}

/** Enqueues a search-queue GET at the lookup's priority and records the job. */
function searchCall(url: string, lookup: Lookup): Promise<any | null> {
  const { promise, job } = searchQueue.run(() => getJson(url), lookup.priority)
  lookup.queued = job
  return promise
}

/** Accumulated search pages. */
interface SearchResult {
  /** Raw Scryfall cards. */
  cards: any[]
  /** Scryfall's `total_cards`. */
  total: number
  /** Stopped at `maxPages`. */
  truncated: boolean
}

/** Searches printings, newest first, up to `maxPages` pages. @returns null if the first page is 404 (no match). */
async function searchPrints(query: string, lookup: Lookup, maxPages: number): Promise<SearchResult | null> {
  let url: string | null =
    `${env().scryfallApi}/cards/search?unique=prints&order=released&dir=desc&q=${encodeURIComponent(query)}`
  const result: SearchResult = { cards: [], total: 0, truncated: false }
  for (let page = 0; url; page++) {
    if (page === maxPages) {
      result.truncated = true
      break
    }
    const body = await searchCall(url, lookup)
    if (!body) return page === 0 ? null : result
    result.cards.push(...body.data)
    result.total = body.total_cards ?? result.cards.length
    url = body.has_more ? body.next_page : null
  }
  return result
}

/**
 * Fetches all paper, non-oversized printings of a card. Tries an exact-name search, falling back
 * to fuzzy `/cards/named` + oracle id search (typos, accents, flavor names). Basic lands fetch only
 * the newest page unless `full`.
 */
async function fetchPrintings(name: string, lookup: Lookup, full: boolean): Promise<PrintingsResult> {
  const basic = isBasicLand(name)
  const maxPages = basic && !full ? 1 : MAX_SEARCH_PAGES
  let search: SearchResult | null = null
  if (!name.includes('"')) {
    const found = await searchPrints(`!"${name}" game:paper`, lookup, maxPages)
    if (found && hasNamedCard(found.cards, name)) {
      found.cards = printingsOfNamedCard(found.cards, name)
      search = found
    }
  }
  if (!search) {
    const named = await searchCall(`${env().scryfallApi}/cards/named?fuzzy=${encodeURIComponent(name)}`, lookup)
    if (!named) return { name, printings: [], fetchedAt: Date.now(), notFound: true }
    search = await searchPrints(`oracleid:${named.oracle_id} game:paper`, lookup, maxPages)
    if (!search || search.cards.length === 0) {
      return { name: named.name, card: toCardInfo(named), printings: [], fetchedAt: Date.now() }
    }
  }
  const { cards } = search
  const printings = cards.filter((card) => !card.digital && !card.oversized).map(toPrinting)
  const result: PrintingsResult = { name: cards[0].name, card: toCardInfo(cards[0]), printings, fetchedAt: Date.now() }
  if (search.truncated) {
    result.partial = true
    result.totalPrintings = search.total
  } else if (basic && full) {
    result.partial = false
  }
  return result
}

/** Pending lookups by nameKey (suffixed `#full` for full fetches); deduplicates requests. */
const inFlight = new Map<string, { promise: Promise<PrintingsResult>; lookup: Lookup }>()

/**
 * Returns a card's printings. Cached results are returned regardless of age unless `force`, or
 * `full` on a partial entry. Concurrent lookups share one request; a high-priority caller promotes
 * a queued low one. Once fully fetched, a basic land stays full on refresh.
 * @returns Fresh result; on failure, the cached one with `staleError`.
 * @throws Error if the fetch fails and nothing is cached.
 */
export async function getPrintings(name: string, options: PrintingsOptions = {}): Promise<PrintingsResult> {
  await scryfallCacheReady()
  const key = nameKey(name)
  const priority = options.priority ?? 'low'
  const cached = scryfallCache.entries[key]
  const upgrade = options.full === true && cached?.partial === true
  if (cached && !options.force && !upgrade) return Promise.resolve(cached)

  const full = options.full === true || cached?.partial === false
  const flightKey = full ? `${key}#full` : key
  const pending = inFlight.get(flightKey)
  if (pending) {
    if (priority === 'high' && pending.lookup.priority === 'low') {
      pending.lookup.priority = 'high'
      if (pending.lookup.queued) searchQueue.promote(pending.lookup.queued)
    }
    return pending.promise
  }

  const lookup: Lookup = { priority }
  const promise = (async () => {
    try {
      const result = await fetchPrintings(name, lookup, full)
      scryfallCache.entries[key] = result
      scryfallCacheChanged()
      return result
    } catch (error) {
      if (cached) return { ...cached, staleError: (error as Error).message }
      throw error
    } finally {
      inFlight.delete(flightKey)
    }
  })()
  inFlight.set(flightKey, { promise, lookup })
  return promise
}

/**
 * Batch card data lookup: cache within {@link CARD_INFO_TTL_MS}, then `/cards/collection` (front-face
 * names), then {@link getPrintings} for unmatched names.
 * @returns Card data by nameKey; null if unknown or failed.
 */
export async function getCardInfos(names: string[]): Promise<Record<string, CardInfo | null>> {
  await scryfallCacheReady()
  const now = Date.now()
  const result: Record<string, CardInfo | null> = {}
  const missing = new Map<string, string>()
  for (const name of names) {
    const key = nameKey(name)
    if (!key || key in result || missing.has(key)) continue
    const printings = scryfallCache.entries[key]
    if (printings && now - printings.fetchedAt < CARD_INFO_TTL_MS && (printings.card || printings.notFound)) {
      result[key] = printings.card ?? null
    } else if (scryfallCache.cards[key] && now - scryfallCache.cards[key].fetchedAt < CARD_INFO_TTL_MS) {
      result[key] = scryfallCache.cards[key].card
    } else {
      missing.set(key, name)
    }
  }

  const pending = [...missing.values()]
  for (let i = 0; i < pending.length; i += COLLECTION_BATCH) {
    const identifiers = pending.slice(i, i + COLLECTION_BATCH).map((name) => ({ name: name.split(' // ')[0] }))
    const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/collection`, { identifiers }), 'high').promise
    for (const card of body?.data ?? []) {
      const key = nameKey(card.name)
      if (!missing.has(key) || key in result) continue
      const info = toCardInfo(card)
      scryfallCache.cards[key] = { fetchedAt: now, card: info }
      result[key] = info
    }
  }

  for (const [key, name] of missing) {
    if (key in result) continue
    try {
      result[key] = (await getPrintings(name, { priority: 'high' })).card ?? null
    } catch {
      result[key] = null
    }
  }
  if (missing.size > 0) scryfallCacheChanged()
  return result
}

/** Session cache of small image URLs by nameKey; null = none. Cleared past {@link MAX_IMAGE_CACHE}. */
const imageCache = new Map<string, string | null>()
/** Max {@link imageCache} entries. */
const MAX_IMAGE_CACHE = 2000

/** Small image URL of the card or its first face, without query. */
function smallImageOf(card: any): string | null {
  const images = card.image_uris ?? card.card_faces?.[0]?.image_uris ?? {}
  return images.small?.split('?')[0] ?? null
}

/**
 * Small image URLs from cached printings or the session cache, else one `/cards/collection`
 * request (first {@link COLLECTION_BATCH} misses). Unknown names are cached as null.
 * @returns URLs by nameKey; null if none. Names beyond the batch are omitted.
 */
export async function getCardImages(names: string[]): Promise<Record<string, string | null>> {
  await scryfallCacheReady()
  const result: Record<string, string | null> = {}
  const missing = new Map<string, string>()
  for (const name of names) {
    const key = nameKey(name)
    if (!key || key in result) continue
    const cached = scryfallCache.entries[key]?.printings.find((p) => p.imageSmall)?.imageSmall
    if (cached) result[key] = cached
    else if (imageCache.has(key)) result[key] = imageCache.get(key) ?? null
    else missing.set(key, name)
  }
  const pending = [...missing.values()].slice(0, COLLECTION_BATCH)
  if (pending.length > 0) {
    const identifiers = pending.map((name) => ({ name: name.split(' // ')[0] }))
    const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/collection`, { identifiers }), 'high').promise
    if (imageCache.size > MAX_IMAGE_CACHE) imageCache.clear()
    for (const card of body?.data ?? []) {
      const key = nameKey(card.name)
      if (!missing.has(key)) continue
      result[key] = smallImageOf(card)
      imageCache.set(key, result[key])
    }
    for (const key of pending.map(nameKey)) {
      if (key in result) continue
      result[key] = null
      imageCache.set(key, null)
    }
  }
  return result
}

/**
 * Fetches card objects by name (front face) or id, in batches of {@link COLLECTION_BATCH}.
 * @returns Raw Scryfall cards found; unknown identifiers are omitted.
 * @throws Error on network failure or an HTTP error.
 */
export async function fetchCollection(identifiers: Array<{ name: string } | { id: string }>): Promise<any[]> {
  const cards: any[] = []
  for (let i = 0; i < identifiers.length; i += COLLECTION_BATCH) {
    const batch = identifiers.slice(i, i + COLLECTION_BATCH)
    const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/collection`, { identifiers: batch }), 'low').promise
    cards.push(...(body?.data ?? []))
  }
  return cards
}

/** Session autocomplete cache by lower-case query; cleared past 500 entries. */
const autocompleteCache = new Map<string, string[]>()

/** @returns Scryfall name suggestions; empty for queries under 2 characters. */
export async function autocomplete(query: string): Promise<string[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const key = q.toLowerCase()
  const hit = autocompleteCache.get(key)
  if (hit) return hit
  const body = await generalQueue
    .run(() => getJson(`${env().scryfallApi}/cards/autocomplete?q=${encodeURIComponent(q)}`), 'high')
    .promise
  const names: string[] = body?.data ?? []
  if (autocompleteCache.size > 500) autocompleteCache.clear()
  autocompleteCache.set(key, names)
  return names
}
