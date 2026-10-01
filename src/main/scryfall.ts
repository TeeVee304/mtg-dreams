import type { PrintingsOptions } from '../shared/api'
import { isBasicLand } from '../shared/cards'
import { nameKey } from '../shared/decklist'
import { hasNamedCard, printingsOfNamedCard } from '../shared/matching'
import type { CardInfo, Prices, Printing, PrintingsResult } from '../shared/types'
import { env } from './environment'
import { fetchJson } from './http'
import { scryfallCache, scryfallCacheChanged, scryfallCacheReady } from './scryfallCache'

// Card data (types, legality) only changes with bans and errata.
const CARD_INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000
// Scryfall's /cards/collection accepts up to 75 cards per request.
const COLLECTION_BATCH = 75
const MAX_SEARCH_PAGES = 10

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Rate limiting. Scryfall's hard limits: 2 req/s for /cards/search and
// /cards/named, 10 req/s for everything else. A 429 locks the client out for
// 30 seconds, so after one we pause every queue.
// ---------------------------------------------------------------------------

let blockedUntil = 0

interface Job {
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

export class RateLimitedQueue {
  private readonly high: Job[] = []
  private readonly low: Job[] = []
  private running = false
  private nextSlot = 0

  constructor(private readonly intervalMs: number) {}

  run<T>(task: () => Promise<T>, priority: 'high' | 'low'): { promise: Promise<T>; job: Job } {
    let job!: Job
    const promise = new Promise<T>((resolve, reject) => {
      job = { task, resolve: resolve as (value: unknown) => void, reject }
    })
    ;(priority === 'high' ? this.high : this.low).push(job)
    void this.pump()
    return { promise, job }
  }

  /** Moves a queued background job to the front, e.g. when the user opens that card. */
  promote(job: Job): void {
    const index = this.low.indexOf(job)
    if (index >= 0) {
      this.low.splice(index, 1)
      this.high.push(job)
    }
  }

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

const searchQueue = new RateLimitedQueue(550)
const generalQueue = new RateLimitedQueue(120)

/** GETs (or, with a body, POSTs) JSON. Returns null on 404; waits out one rate-limit lockout. */
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

// ---------------------------------------------------------------------------
// Card data mapping
// ---------------------------------------------------------------------------

function parsePrice(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function trendOnly(value: unknown): Prices {
  const price = parsePrice(value)
  return price === null ? {} : { trend: price }
}

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

function flavorNameOf(card: any): string | undefined {
  return card.flavor_name ?? card.card_faces?.[0]?.flavor_name ?? undefined
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
    // Scryfall's EUR prices are Cardmarket's trend: kept as the fallback for the price guide (priceGuide.ts).
    price: trendOnly(card.prices?.eur),
    priceFoil: trendOnly(card.prices?.eur_foil),
    // Without Scryfall's ?version suffix, so cached addresses stay short (see scryfallCache.ts).
    imageSmall: images.small?.split('?')[0] ?? null,
    imageNormal: images.normal?.split('?')[0] ?? null,
    cardmarketUrl: card.purchase_uris?.cardmarket ?? null,
    labels: labelsFor(card),
    autoEligible: card.border_color !== 'gold' && card.set_type !== 'memorabilia',
    ...(flavorNameOf(card) && { flavorName: flavorNameOf(card) })
  }
}

const DECK_LIMIT_RE = /A deck can have (?:any number of|up to (\w+)) cards named/i
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
// Noncreature cards that may lead a Commander deck: "can be your commander" (some
// planeswalkers), or a creature everywhere but the battlefield (Grist, the Hunger Tide).
const LEADS_RE = /can be your commander|isn't on the battlefield, it's an? [^.]*\bcreature\b/i

function toCardInfo(card: any): CardInfo {
  const faces: any[] = card.card_faces ?? []
  // Double-faced cards keep their colors on the faces.
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

/** Tracks one card lookup so it can be promoted while its requests are queued. */
interface Lookup {
  priority: 'high' | 'low'
  queued?: Job
}

function searchCall(url: string, lookup: Lookup): Promise<any | null> {
  const { promise, job } = searchQueue.run(() => getJson(url), lookup.priority)
  lookup.queued = job
  return promise
}

interface SearchResult {
  cards: any[]
  total: number
  truncated: boolean
}

/** Newest printings first. Stops after `maxPages` pages of 175; null if nothing matched. */
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
 * Basic lands have hundreds of printings (Swamp: ~800, five requests) that all
 * cost cents, so unless `full` is asked for only the newest page is fetched.
 */
async function fetchPrintings(name: string, lookup: Lookup, full: boolean): Promise<PrintingsResult> {
  const basic = isBasicLand(name)
  const maxPages = basic && !full ? 1 : MAX_SEARCH_PAGES
  let search: SearchResult | null = null
  if (!name.includes('"')) {
    const found = await searchPrints(`!"${name}" game:paper`, lookup, maxPages)
    // A printed (flavor) name like "Franklin's Finality" only finds the printings that
    // carry it; those go through the fuzzy route below to get every printing of the card.
    if (found && hasNamedCard(found.cards, name)) {
      found.cards = printingsOfNamedCard(found.cards, name)
      search = found
    }
  }
  if (!search) {
    // Not an exact card name (typo, missing accent, quotes, printed name...): let Scryfall match it.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const inFlight = new Map<string, { promise: Promise<PrintingsResult>; lookup: Lookup }>()

/**
 * Printings and prices for a card. Cached results are returned straight away,
 * however old; the renderer refreshes old prices in the background with `force`.
 */
export async function getPrintings(name: string, options: PrintingsOptions = {}): Promise<PrintingsResult> {
  await scryfallCacheReady()
  const key = nameKey(name)
  const priority = options.priority ?? 'low'
  const cached = scryfallCache.entries[key]
  const upgrade = options.full === true && cached?.partial === true
  if (cached && !options.force && !upgrade) return Promise.resolve(cached)

  // Once every printing of a basic land was asked for, refreshes keep fetching them all.
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
 * Card data (colors, type, legality...) for many names at once, keyed by nameKey.
 * Uses the price cache when possible and Scryfall's batch endpoint for the rest;
 * names it doesn't recognise exactly (typos) fall back to the fuzzy lookup.
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
    // The batch endpoint only knows front-face names for double-faced cards.
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

// Pictures for search suggestions, by name key: from cached printings when there are
// some, else one batch request for all the names that lack one. Kept for the session.
const imageCache = new Map<string, string | null>()
const MAX_IMAGE_CACHE = 2000

function smallImageOf(card: any): string | null {
  const images = card.image_uris ?? card.card_faces?.[0]?.image_uris ?? {}
  return images.small?.split('?')[0] ?? null
}

/** A small picture of each card, keyed by nameKey (null when Scryfall has none). */
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
    // Names Scryfall doesn't know aren't asked about again either.
    for (const key of pending.map(nameKey)) {
      if (key in result) continue
      result[key] = null
      imageCache.set(key, null)
    }
  }
  return result
}

const autocompleteCache = new Map<string, string[]>()

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
