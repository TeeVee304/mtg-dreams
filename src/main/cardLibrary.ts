import { nameKey } from '@shared/decklist'
import { FORMATS } from '@shared/formats'
import { readCard, type CardProfile } from '@shared/mechanics'
import type { LibraryCard, PriceBasis } from '@shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { env } from './environment'
import { fetchJson, fetchLines } from './http'
import { guidePrice } from './priceGuide'
import { toCardInfo } from './scryfall'

/**
 * Local card library for the deckbuilding helper: every Oracle card legal in a supported format,
 * with rules text, keywords and Cardmarket products. Built from Scryfall's bulk data by streaming
 * its Oracle cards and default printings (~100 MB compressed) when they change, checked at most
 * weekly, and saved compactly in userData. Loaded on first use; card profiles are read in chunks so
 * the main process stays responsive.
 *
 * @packageDocumentation
 */

/** Cache file name. */
const FILE = 'card-library.json'
/** Cache schema version. */
const VERSION = 1
/** Scryfall is asked for newer card data after this long. */
const CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000
/** Cards read per chunk when building profiles, between which other work can run. */
const PROFILE_CHUNK = 2000
/** Format ids whose legality is kept. */
const FORMAT_IDS = new Set(FORMATS.map((format) => format.id))

/** On-disk library. */
interface LibraryFile {
  version: number
  /** Scryfall's `updated_at` of the Oracle cards file. */
  updatedAt: string
  /** Epoch ms of download. */
  fetchedAt: number
  cards: LibraryCard[]
}

/** A library card with what it does. */
export interface CardWithProfile {
  card: LibraryCard
  profile: CardProfile
}

/** In-memory library. */
interface Library {
  updatedAt: string
  /** Epoch ms Scryfall was last asked for newer data. */
  checkedAt: number
  cards: LibraryCard[]
  /** Cards by {@link nameKey} (front face name, any case). */
  byName: Map<string, LibraryCard>
  /** Profiles, read on first request. */
  profiles: Promise<CardWithProfile[]> | null
}

/** What the library is doing, for progress display. */
export type CardLibraryStatus =
  | { state: 'missing' }
  /** `progress` 0 to 1; null if the size is unknown. */
  | { state: 'downloading'; progress: number | null }
  | { state: 'ready'; cards: number; updatedAt: string }

let library: Library | null = null
let loading: Promise<void> | null = null
let refreshing: Promise<boolean> | null = null
/** Download progress while refreshing; undefined otherwise. */
let progress: number | null | undefined

/** Builds the in-memory library. */
function toLibrary(cards: LibraryCard[], updatedAt: string, checkedAt: number): Library {
  const byName = new Map(cards.map((card) => [nameKey(card.name), card]))
  return { updatedAt, checkedAt, cards, byName, profiles: null }
}

/** Parses one bulk-data line; tolerates the JSON-array form (`[`, `]`, trailing commas). @returns null if invalid. */
function parseLine(line: string): any | null {
  const json = line.trim().replace(/,$/, '')
  if (json === '[' || json === ']') return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Oracle id of a Scryfall card; reversible cards keep it on their faces. */
const oracleIdOf = (card: any): string | undefined => card.oracle_id ?? card.card_faces?.[0]?.oracle_id

/**
 * Maps a Scryfall Oracle card to a {@link LibraryCard} without products.
 * @returns null for cards legal in no supported format (tokens, digital-only and joke cards).
 */
function toLibraryCard(raw: any): LibraryCard | null {
  const info = toCardInfo(raw)
  const legalities = Object.fromEntries(
    Object.entries(info.legalities).filter(([id, status]) => FORMAT_IDS.has(id) && status !== 'not_legal')
  )
  if (Object.keys(legalities).length === 0) return null
  const faces: any[] = raw.card_faces ?? []
  return {
    ...info,
    legalities,
    manaCost: raw.mana_cost ?? faces.map((face) => face.mana_cost ?? '').filter(Boolean).join(' // '),
    text: raw.oracle_text ?? faces.map((face) => face.oracle_text ?? '').join('\n'),
    keywords: raw.keywords ?? [],
    products: []
  }
}

/**
 * Builds the library from Scryfall bulk data: Oracle cards first, then printings, whose Cardmarket
 * products are added to their card. Gold-bordered and memorabilia printings are left out, as for
 * automatic printing choice elsewhere.
 * @param oracleLines - Lines of Scryfall's `oracle_cards` JSONL file.
 * @param printLines - Lines of Scryfall's `default_cards` JSONL file.
 * @returns Cards sorted by name.
 */
export async function buildCardLibrary(oracleLines: AsyncIterable<string>, printLines: AsyncIterable<string>): Promise<LibraryCard[]> {
  const byOracle = new Map<string, LibraryCard>()
  for await (const line of oracleLines) {
    const raw = parseLine(line)
    const id = raw && oracleIdOf(raw)
    const card = id && toLibraryCard(raw)
    if (card) byOracle.set(id, card)
  }
  for await (const line of printLines) {
    const raw = parseLine(line)
    const card = raw && byOracle.get(oracleIdOf(raw) ?? '')
    if (!card || !Number.isSafeInteger(raw.cardmarket_id) || !(raw.games ?? []).includes('paper')) continue
    if (raw.border_color === 'gold' || raw.set_type === 'memorabilia') continue
    card.products.push((raw.finishes ?? []).includes('nonfoil') ? raw.cardmarket_id : -raw.cardmarket_id)
  }
  return [...byOracle.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Loads the saved library once; concurrent and later calls share the same promise. Outdated files are ignored. */
export function loadCardLibrary(): Promise<void> {
  loading ??= (async () => {
    const file = await readCacheFile<LibraryFile>(FILE)
    if (file?.version !== VERSION || !Array.isArray(file.cards)) return
    library ??= toLibrary(file.cards, file.updatedAt, file.fetchedAt)
  })()
  return loading
}

/**
 * Downloads and saves the library if Scryfall has newer card data; concurrent calls share one refresh.
 * @returns Whether the library changed.
 * @throws Error on network failure or invalid data; the current library is kept.
 */
export function refreshCardLibrary(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      await loadCardLibrary()
      const res = await fetchJson(`${env().scryfallApi}/bulk-data`, 'Scryfall')
      const files: any[] = Array.isArray(res.data?.data) ? res.data.data : []
      const oracle = files.find((file) => file.type === 'oracle_cards')
      const prints = files.find((file) => file.type === 'default_cards')
      if (res.status >= 400 || !oracle?.jsonl_download_uri || !prints?.jsonl_download_uri) {
        throw new Error(`Scryfall's card data is unavailable (HTTP ${res.status}).`)
      }
      if (library && library.updatedAt === oracle.updated_at) {
        library.checkedAt = Date.now()
        return false
      }
      const oracleSize = Number(oracle.compressed_size) || 0
      const total = oracleSize + (Number(prints.compressed_size) || 0)
      const share = (offset: number) => (received: number) => {
        progress = total > 0 ? Math.min(1, (offset + received) / total) : null
      }
      progress = total > 0 ? 0 : null
      const cards = await buildCardLibrary(
        fetchLines(oracle.jsonl_download_uri, 'Scryfall', share(0)),
        fetchLines(prints.jsonl_download_uri, 'Scryfall', share(oracleSize))
      )
      if (cards.length === 0) throw new Error('Scryfall sent an empty card list. Try again later.')
      const fetchedAt = Date.now()
      library = toLibrary(cards, oracle.updated_at, fetchedAt)
      const file: LibraryFile = { version: VERSION, updatedAt: oracle.updated_at, fetchedAt, cards }
      await writeCacheFile(FILE, file)
      return true
    } finally {
      refreshing = null
      progress = undefined
    }
  })()
  return refreshing
}

/**
 * Makes the library available: loads it, downloads it when missing, and refreshes it in the
 * background when it was last checked over a week ago.
 * @throws Error when there is no library and the download fails.
 */
export async function ensureCardLibrary(): Promise<void> {
  await loadCardLibrary()
  if (!library) {
    await refreshCardLibrary()
    return
  }
  if (Date.now() - library.checkedAt > CHECK_EVERY_MS) void refreshCardLibrary().catch(() => undefined)
}

/** @returns What the library is doing. */
export function cardLibraryStatus(): CardLibraryStatus {
  if (progress !== undefined) return { state: 'downloading', progress }
  return library ? { state: 'ready', cards: library.cards.length, updatedAt: library.updatedAt } : { state: 'missing' }
}

/** @returns The card by name, any case, or by its front face name; undefined if unknown or not loaded. */
export function libraryCard(name: string): LibraryCard | undefined {
  return library?.byName.get(nameKey(name))
}

/** @returns Every card with its profile; read once per library, in chunks. Empty until loaded. */
export function libraryProfiles(): Promise<CardWithProfile[]> {
  const current = library
  if (!current) return Promise.resolve([])
  current.profiles ??= (async () => {
    const result: CardWithProfile[] = []
    for (let i = 0; i < current.cards.length; i += PROFILE_CHUNK) {
      for (const card of current.cards.slice(i, i + PROFILE_CHUNK)) result.push({ card, profile: readCard(card) })
      await new Promise((resolve) => setImmediate(resolve))
    }
    return result
  })()
  return current.profiles
}

/**
 * @returns Cheapest Cardmarket price of the card's paper printings on `basis`, non-foil where a
 * printing has it; null if none is priced. Requires the price guide to be loaded.
 */
export function cheapestPrice(card: LibraryCard, basis: PriceBasis): number | null {
  let best: number | null = null
  for (const product of card.products) {
    const price = guidePrice(Math.abs(product), product < 0, basis)
    if (price !== null && (best === null || price < best)) best = price
  }
  return best
}
