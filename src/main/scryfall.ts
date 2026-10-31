import type { PrintingsOptions } from '@shared/api'
import { isBasicLand } from '@shared/cards'
import { nameKey } from '@shared/decklist'
import { companionOf, hasActivatedAbility, repeatsManaSymbol, rulebreakerOf } from '@shared/deckRules'
import { partnerAbility } from '@shared/formats'
import { languageOf, type Language } from '@shared/languages'
import { energyOf, fetchedColors, rampKind } from '@shared/manaText'
import { hasNamedCard, printingsOfNamedCard } from '@shared/matching'
import { ui } from '@shared/text'
import type { CardFace, CardInfo, LocalizedImage, LocalizedQuery, Prices, PrintedFace, Printing, PrintingsResult, Ruling } from '@shared/types'
import { env } from './environment'
import { fetchJson } from './http'
import { cachedEntry, scryfallCache, scryfallCacheChanged, scryfallCacheReady, storeEntry, touchEntry } from './scryfallCache'

/** Card data TTL; changes only with bans and errata. */
const CARD_INFO_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Age after which a name Scryfall didn't know is looked up again (a new card, or a fixed name). */
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000

/**
 * @returns Whether a cached "not found" result should be looked up again for `name`: it was cached
 * for another line that shares the name key (an unparsed suffix: `Name (SET) 1 [Category]`), or
 * long enough ago that the card may exist now.
 */
function staleMiss(entry: PrintingsResult, name: string): boolean {
  const old = Date.now() - entry.fetchedAt > NOT_FOUND_TTL_MS
  // A card without printings: printed since, or on Arena only (cached before Arena printings were kept).
  if (entry.card && entry.printings.length === 0) return old
  return entry.notFound === true && (entry.name !== name || old)
}
/** Max identifiers per `/cards/collection` request. */
const COLLECTION_BATCH = 75
/** Max search result pages (175 cards each) per lookup. */
const MAX_SEARCH_PAGES = 10
/** Names per search for printed names in other languages ({@link findForeign}). */
const FOREIGN_BATCH = 20

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
      throw new Error(ui.errors.scryfallRateLimit)
    }
    if (res.status === 404) return null
    if (res.status >= 400 || res.data === null) throw new Error(ui.errors.http('Scryfall', res.status))
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
  const tags = ui.printingTags
  const effects: string[] = card.frame_effects ?? []
  const promoTypes: string[] = card.promo_types ?? []
  if (card.border_color === 'borderless') labels.push(tags.borderless)
  if (effects.includes('showcase')) labels.push(tags.showcase)
  if (effects.includes('extendedart')) labels.push(tags.extendedArt)
  if (card.full_art) labels.push(tags.fullArt)
  if (card.textless) labels.push(tags.textless)
  if (effects.includes('etched') || (card.finishes ?? []).includes('etched')) labels.push(tags.etched)
  if (promoTypes.includes('serialized')) labels.push(tags.serialized)
  if (card.promo) labels.push(tags.promo)
  if (card.border_color === 'white') labels.push(tags.whiteBorder)
  if (card.border_color === 'gold') labels.push(tags.goldBorder)
  if (card.set_type === 'memorabilia') labels.push(tags.notLegal)
  if (card.lang && card.lang !== 'en') labels.push(String(card.lang).toUpperCase())
  const flavorName = flavorNameOf(card)
  if (flavorName) labels.push(tags.printedAs(flavorName))
  return labels
}

/** Artwork id of the card or its first face. */
function illustrationOf(card: any): string | undefined {
  return card.illustration_id ?? card.card_faces?.[0]?.illustration_id ?? undefined
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
    ...(flavorNameOf(card) && { flavorName: flavorNameOf(card) }),
    ...(illustrationOf(card) && { illustrationId: illustrationOf(card) }),
    ...((card.promo_types ?? []).includes('universesbeyond') && { universesBeyond: true as const }),
    ...(card.digital === true && { digital: true as const })
  }
}

/** Rules text overriding the copy limit ("any number of" / "up to N"). */
const DECK_LIMIT_RE = /A deck can have (?:any number of|up to (\w+)) cards named/i
/** Number words used in {@link DECK_LIMIT_RE}. */
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
/** Rules text letting a noncreature card be commander: "can be your commander", or creature off the battlefield (Grist). */
const LEADS_RE = /can be your commander|isn't on the battlefield, it's an? [^.]*\bcreature\b/i

/** @returns Mana colors in WUBRG order, colorless last. */
const sortColors = (colors: string[]) => [...new Set(colors)].sort((a, b) => 'WUBRGC'.indexOf(a) - 'WUBRGC'.indexOf(b))

/** Changeling, which gives a card every creature type. */
const CHANGELING_RE = /^Changeling\b|is every creature type/im

/** @returns What a Scryfall card or card face says: name, cost, type line, rules text and stats. */
function faceOf(face: any): CardFace {
  return {
    name: face.name ?? '',
    ...(face.mana_cost && { manaCost: face.mana_cost }),
    typeLine: face.type_line ?? '',
    text: face.oracle_text ?? '',
    ...(face.power !== undefined && face.toughness !== undefined && { pt: `${face.power}/${face.toughness}` }),
    ...(face.loyalty !== undefined && { loyalty: face.loyalty }),
    ...(face.defense !== undefined && { defense: face.defense })
  }
}

/**
 * @returns A card's faces ({@link CardInfo.faces}): the card itself without faces, the front alone
 * for a reversible card (both faces are the same card).
 */
function facesOf(card: any): CardFace[] {
  const faces: any[] = card.card_faces ?? []
  if (faces.length === 0) return [faceOf(card)]
  return (card.layout === 'reversible_card' ? faces.slice(0, 1) : faces).map(faceOf)
}

/** Maps a Scryfall card to {@link CardInfo}; colors fall back to the union of face colors, sorted WUBRG. */
export function toCardInfo(card: any): CardInfo {
  const faces: any[] = card.card_faces ?? []
  const colors: string[] = card.colors ?? [...new Set(faces.flatMap((face) => face.colors ?? []))]
  const text: string = card.oracle_text ?? faces.map((face) => face.oracle_text ?? '').join('\n')
  // In a deck a card has its front face only; a split card has both halves. Scryfall joins all faces'
  // costs at the top level, so other two-faced cards (modal, Adventure) take the front face's.
  const split = card.layout === 'split' || faces.length === 0
  const cost: string = (split ? card.mana_cost : faces[0]?.mana_cost) ?? ''
  // A reversible card (Secret Lair's two-art printings) is one card on both faces, with no name,
  // type or mana value of its own: they're the front face's.
  const reversible = card.layout === 'reversible_card' && faces.length > 0
  const frontText: string = split ? text : (faces[0]?.oracle_text ?? '')
  const isLand = /\bLand\b/.test((faces[0]?.type_line ?? card.type_line ?? '').split('—')[0])
  const produced: string[] = card.produced_mana ?? []
  const produces = produced.length > 0 ? produced : isLand ? fetchedColors(text) : []
  const ramp = rampKind(card.type_line ?? faces[0]?.type_line ?? '', frontText, produced)
  const energy = energyOf(frontText)
  const rulebreaker = rulebreakerOf(card.name, text)
  const companion = companionOf(card.name, text)
  const limit = DECK_LIMIT_RE.exec(text)
  let deckLimit: CardInfo['deckLimit']
  if (limit) {
    const n = limit[1] ? (NUMBER_WORDS[limit[1].toLowerCase()] ?? Number(limit[1])) : Infinity
    deckLimit = Number.isFinite(n) ? n : 'any'
  }
  return {
    name: reversible ? faces[0].name : card.name,
    colors: colors.sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)),
    colorIdentity: card.color_identity ?? [],
    typeLine: card.type_line ?? (reversible ? faces[0].type_line : faces.map((face) => face.type_line ?? '').join(' // ')),
    manaValue: card.cmc ?? faces[0]?.cmc ?? 0,
    rarity: card.rarity ?? 'common',
    legalities: card.legalities ?? {},
    ...(deckLimit !== undefined && { deckLimit }),
    ...(LEADS_RE.test(text) && { canBeCommander: true as const }),
    ...(partnerAbility(text) && { partner: partnerAbility(text) }),
    ...(card.game_changer === true && { gameChanger: true as const }),
    ...(rulebreaker && { rulebreaker }),
    ...(companion && { companion }),
    ...(repeatsManaSymbol(cost) && { repeatsSymbol: true as const }),
    ...(hasActivatedAbility(frontText) && { activated: true as const }),
    ...(CHANGELING_RE.test(frontText) && { changeling: true as const }),
    ...(cost && { manaCost: cost }),
    ...(produces.length > 0 && { produces: sortColors(produces) }),
    ...(ramp && { ramp }),
    ...(energy && { energy }),
    faces: facesOf(card)
  }
}

/** Lookup state; `queued` is the currently queued job, for promotion. */
export interface Lookup {
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

/** Pages of token Versions fetched: 175 Versions each. */
const TOKEN_VERSION_PAGES = 2

/** @returns Raw Scryfall printings of a token, by its oracle id, newest first; empty if unknown or offline. */
export async function searchTokenVersions(oracleId: string): Promise<any[]> {
  const found = await searchPrints(`oracleid:${oracleId} include:extras -is:digital`, { priority: 'high' }, TOKEN_VERSION_PAGES)
  return found?.cards ?? []
}

/** @returns Whether Scryfall has a real scan of a printing, not a placeholder (an English image) or none. */
const scanned = (card: any) => card?.image_status === 'highres_scan' || card?.image_status === 'lowres'

/** @returns A printing's faces as printed in its language; none when Scryfall has no printed text. */
function printedFacesOf(card: any): PrintedFace[] {
  const faces: any[] = card.card_faces?.length ? card.card_faces : [card]
  if (!faces.some((face) => face.printed_text !== undefined)) return []
  return faces.map((face) => ({
    name: face.printed_name ?? face.name ?? '',
    typeLine: face.printed_type_line ?? face.type_line ?? '',
    text: face.printed_text ?? ''
  }))
}

/**
 * @returns A printing's normal-size images (front, and back of a two-sided card) and printed text;
 * null without a scan or a printing.
 */
function imagesOf(card: any): LocalizedImage | null {
  if (!card) return null
  const normal = (card.image_uris ?? card.card_faces?.[0]?.image_uris)?.normal
  if (!scanned(card) || !normal) return null
  const faces = printedFacesOf(card)
  return { imageNormal: normal.split('?')[0], imageBack: backImageOf(card), ...(faces.length > 0 && { faces }) }
}

/**
 * Finds a Card's images in a language: those of the printing asked for, else of its newest printing
 * with a scan in that language.
 * @returns The images; null if none is scanned in that language.
 * @throws Error if Scryfall can't be reached.
 */
export async function searchLocalized({ name, lang, set, collector }: LocalizedQuery): Promise<LocalizedImage | null> {
  if (set && collector) {
    const url = `${env().scryfallApi}/cards/${encodeURIComponent(set)}/${encodeURIComponent(collector)}/${lang}`
    const exact = imagesOf(await generalQueue.run(() => getJson(url), 'high').promise)
    if (exact) return exact
  }
  const front = name.split(' // ')[0]
  if (front.includes('"')) return null
  const query = `!"${front}" lang:${lang} -is:digital`
  const url = `${env().scryfallApi}/cards/search?include_multilingual=true&unique=prints&order=released&dir=desc&q=${encodeURIComponent(query)}`
  const body = await searchQueue.run(() => getJson(url), 'high').promise
  for (const card of body?.data ?? []) {
    const images = imagesOf(card)
    if (images) return images
  }
  return null
}

/**
 * @returns A card's rulings, newest first, by the Scryfall id of any of its printings (rulings belong
 * to the card); empty for none or an unknown id.
 * @throws Error if Scryfall can't be reached.
 */
export async function fetchRulings(id: string): Promise<Ruling[]> {
  const url = `${env().scryfallApi}/cards/${encodeURIComponent(id)}/rulings`
  const body = await generalQueue.run(() => getJson(url), 'high').promise
  const rulings: Ruling[] = (body?.data ?? [])
    .filter((ruling: any) => typeof ruling?.comment === 'string' && ruling.comment.trim())
    .map((ruling: any) => ({ date: String(ruling.published_at ?? ''), source: String(ruling.source ?? ''), text: ruling.comment.trim() }))
  return rulings.sort((a, b) => b.date.localeCompare(a.date))
}

/** @returns `text` in lower case without accents, spaces or punctuation: "Lim-Dûl's Vault" is "limdulsvault". */
export const bareLetters = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

/** A card found by a name that is not its exact English one. */
export interface NameMatch {
  /** Raw Scryfall card. */
  card: any
  /** Language of the printed name matched; absent for English. */
  lang?: Language
  /** A near match: a typo, or a flavor name. */
  fuzzy?: true
}

/** @returns The printed names of a Scryfall card: its own and its faces'. */
const printedNames = (card: any): string[] =>
  [card.printed_name, ...(card.card_faces ?? []).map((face: any) => face.printed_name)].filter(Boolean)

/**
 * Finds cards by printed names in other languages, exactly but for accents and case, searching
 * {@link FOREIGN_BATCH} names at a time. A name has a language only if its Card prints it in one
 * language. Without its accents, a name several Cards print is a fuzzy match.
 * @returns Matches by {@link bareLetters} of the name; names without one are left out.
 */
export async function findForeign(names: string[], lookup: Lookup): Promise<Map<string, NameMatch>> {
  const matches = new Map<string, NameMatch>()
  const wanted = [...new Set(names.map((name) => name.trim()).filter((name) => name && !name.includes('"')))]
  for (let i = 0; i < wanted.length; i += FOREIGN_BATCH) {
    const batch = wanted.slice(i, i + FOREIGN_BATCH)
    const query = `(${batch.map((name) => `!"${name}"`).join(' or ')}) lang:any -lang:en`
    let url: string | null =
      `${env().scryfallApi}/cards/search?include_multilingual=true&unique=prints&q=${encodeURIComponent(query)}`
    const found = new Map<string, any[]>()
    for (let page = 0; url && page < MAX_SEARCH_PAGES; page++) {
      const body = await searchCall(url, lookup)
      if (!body) break
      for (const card of body.data) {
        for (const printed of printedNames(card)) {
          const key = bareLetters(printed)
          if (!found.has(key)) found.set(key, [])
          found.get(key)!.push(card)
        }
      }
      url = body.has_more ? body.next_page : null
    }
    for (const name of batch) {
      const cards = found.get(bareLetters(name))
      if (!cards) continue
      // As typed, accents and all, if any Card prints it so: "Relámpago" is Lightning Bolt, "Relâmpago" Thunderbolt.
      const typed = name.toLocaleLowerCase()
      const exact = cards.filter((card) => printedNames(card).some((printed) => printed.toLocaleLowerCase() === typed))
      const pool = exact.length > 0 ? exact : cards
      const card = pool[0]
      const langs = new Set(pool.filter((other) => other.oracle_id === card.oracle_id).map((other) => other.lang))
      const lang = langs.size === 1 ? languageOf(card.lang) : undefined
      const ambiguous = new Set(pool.map((other) => other.oracle_id)).size > 1
      matches.set(bareLetters(name), { card, ...(lang && { lang }), ...(ambiguous && { fuzzy: true as const }) })
    }
  }
  return matches
}

/**
 * Finds a card by a name that is not its exact English one: a printed name in another language
 * first, else a fuzzy English match (typos, flavor names). Foreign names go first, as a fuzzy match
 * takes "Relampago" for Lightning Greaves. A fuzzy match differing only in accents, case or
 * punctuation counts as exact.
 * @returns null if neither matches.
 */
export async function findByName(name: string, lookup: Lookup): Promise<NameMatch | null> {
  return (await findForeign([name], lookup)).get(bareLetters(name)) ?? (await fuzzyNamed(name, lookup))
}

/** @returns A fuzzy English match for `name`, exact if only accents, case or punctuation differ; null if none. */
export async function fuzzyNamed(name: string, lookup: Lookup): Promise<NameMatch | null> {
  const named = await searchCall(`${env().scryfallApi}/cards/named?fuzzy=${encodeURIComponent(name)}`, lookup)
  if (!named) return null
  const names: string[] = [named.name, ...(named.card_faces ?? []).map((face: any) => face.name)]
  return names.some((other) => bareLetters(other) === bareLetters(name)) ? { card: named } : { card: named, fuzzy: true }
}

/**
 * Fetches all paper, non-oversized printings of a card. Tries an exact-name search, falling back
 * to {@link findByName} + oracle id search (other languages, typos, accents, flavor names). A card
 * never printed on paper gets its MTG Arena printings, marked `digital`, for Arena formats. Basic
 * lands fetch only the newest page unless `full`.
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
  let lang: Language | undefined
  if (!search) {
    const match = await findByName(name, lookup)
    if (!match) return { name, printings: [], fetchedAt: Date.now(), notFound: true }
    lang = match.lang
    search = await searchPrints(`oracleid:${match.card.oracle_id} game:paper`, lookup, maxPages)
    if (!search || search.cards.length === 0) search = await searchPrints(`oracleid:${match.card.oracle_id} game:arena`, lookup, maxPages)
    if (!search || search.cards.length === 0) {
      return { name: match.card.name, ...(lang && { lang }), card: toCardInfo(match.card), printings: [], fetchedAt: Date.now() }
    }
  }
  const { cards } = search
  const arenaOnly = cards.every((card) => card.digital)
  const printings = cards.filter((card) => (arenaOnly || !card.digital) && !card.oversized).map(toPrinting)
  const result: PrintingsResult = { name: cards[0].name, ...(lang && { lang }), card: toCardInfo(cards[0]), printings, fetchedAt: Date.now() }
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
  const cached = cachedEntry(key)
  const upgrade = options.full === true && cached?.partial === true
  if (cached && !options.force && !upgrade && !staleMiss(cached, name)) {
    touchEntry(key)
    return Promise.resolve(cached)
  }

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
      storeEntry(key, result)
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
    const printings = cachedEntry(key)
    if (printings && now - printings.fetchedAt < CARD_INFO_TTL_MS && (printings.card || (printings.notFound && !staleMiss(printings, name)))) {
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

/** Session cache of small image URLs by nameKey; null = none. Keeps the {@link MAX_IMAGE_CACHE} most recently used. */
const imageCache = new Map<string, string | null>()
/** Max {@link imageCache} entries. */
const MAX_IMAGE_CACHE = 2000

/** Caches an image URL as the most recently used, dropping the least recently used past {@link MAX_IMAGE_CACHE}. */
function cacheImage(key: string, url: string | null): void {
  imageCache.delete(key)
  imageCache.set(key, url)
  while (imageCache.size > MAX_IMAGE_CACHE) imageCache.delete(imageCache.keys().next().value!)
}

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
    const cached = cachedEntry(key)?.printings.find((p) => p.imageSmall)?.imageSmall
    if (cached) result[key] = cached
    else if (imageCache.has(key)) {
      result[key] = imageCache.get(key) ?? null
      cacheImage(key, result[key])
    }
    else missing.set(key, name)
  }
  const pending = [...missing.values()].slice(0, COLLECTION_BATCH)
  if (pending.length > 0) {
    const identifiers = pending.map((name) => ({ name: name.split(' // ')[0] }))
    const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/collection`, { identifiers }), 'high').promise
    for (const card of body?.data ?? []) {
      const key = nameKey(card.name)
      if (!missing.has(key)) continue
      result[key] = smallImageOf(card)
      cacheImage(key, result[key])
    }
    for (const key of pending.map(nameKey)) {
      if (key in result) continue
      result[key] = null
      cacheImage(key, null)
    }
  }
  return result
}

/** A `/cards/collection` identifier: a name (front face), an id, or a set code and collector number. */
export type CollectionId = { name: string } | { id: string } | { set: string; collector_number: string }

/**
 * Fetches card objects by name (front face), id, or set code and collector number, in batches of
 * {@link COLLECTION_BATCH}.
 * @returns Raw Scryfall cards found; unknown identifiers are omitted.
 * @throws Error on network failure or an HTTP error.
 */
export async function fetchCollection(identifiers: CollectionId[], priority: 'high' | 'low' = 'low'): Promise<any[]> {
  const cards: any[] = []
  for (let i = 0; i < identifiers.length; i += COLLECTION_BATCH) {
    const batch = identifiers.slice(i, i + COLLECTION_BATCH)
    const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/collection`, { identifiers: batch }), priority).promise
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

/**
 * @returns All Scryfall sets.
 * @throws Error on network failure or an HTTP error.
 */
export async function fetchSets(): Promise<any[]> {
  const body = await generalQueue.run(() => getJson(`${env().scryfallApi}/sets`), 'low').promise
  return body?.data ?? []
}

/**
 * Asked ahead of card lookups: the Preferred Versions picker waits on it.
 * @returns How many printings of a set are Universes Beyond Cards.
 * @throws Error on network failure or an HTTP error.
 */
export async function countUniversesBeyond(set: string): Promise<number> {
  const query = encodeURIComponent(`e:${set} is:universesbeyond`)
  const body = await searchQueue.run(() => getJson(`${env().scryfallApi}/cards/search?unique=prints&q=${query}`), 'high').promise
  return body?.total_cards ?? 0
}
