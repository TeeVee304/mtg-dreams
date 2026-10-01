import { simplifyCardName } from '../shared/precons'
import type { PreconCard, PreconDeck, PreconSummary } from '../shared/types'
import { readCacheFile, writeCacheFile } from './cacheFiles'
import { env } from './environment'
import { fetchJson } from './http'

// Official decklists come from MTGJSON (Scryfall has no decklist endpoint).
// Both the deck index and individual decks are cached in userData.

const INDEX_TTL_MS = 24 * 60 * 60 * 1000
// Upcoming decks can still be corrected, so decklists are re-checked weekly.
const DECK_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FILE_NAME_RE = /^[A-Za-z0-9_-]+$/
// Bump when the cached deck format changes so old entries are ignored.
const DECK_CACHE_VERSION = 3

/** Products that only exist on MTG Arena, MTGO or old PC games. */
const DIGITAL_TYPES = new Set([
  'Arena Starter Deck',
  'Arena Starter Kit',
  'Arena Promotional Deck',
  'Historic Brawl Precon Deck',
  'MTGO Theme Deck',
  'MTGO Redemption',
  'MTGO Commander Deck',
  'MTGO Duel Deck',
  'Shandalar Enemy Deck',
  'Duel Of The Planeswalkers Deck'
])

const BOARDS: Array<[string, PreconCard['board']]> = [
  ['commander', 'commander'],
  ['mainBoard', 'main'],
  ['sideBoard', 'side'],
  ['planes', 'other'],
  ['schemes', 'other']
]

// Cached in userData/precons/.
const readCache = <T>(file: string) => readCacheFile<T>(`precons/${file}`)
const writeCache = (file: string, data: unknown) => writeCacheFile(`precons/${file}`, data)

async function getJson(url: string): Promise<any> {
  const res = await fetchJson(url, 'MTGJSON')
  if (res.status >= 400 || res.data === null) throw new Error(`MTGJSON responded with HTTP ${res.status}.`)
  return res.data
}

interface Cached<T> {
  fetchedAt: number
  data: T
}

let index: Cached<PreconSummary[]> | null = null

/** Paper precons, newest first. */
export async function getPreconIndex(): Promise<PreconSummary[]> {
  index ??= await readCache<Cached<PreconSummary[]>>('index.json')
  if (index && Date.now() - index.fetchedAt < INDEX_TTL_MS) return index.data
  try {
    const body = await getJson(`${env().mtgjsonApi}/DeckList.json`)
    const decks: PreconSummary[] = (body.data as any[])
      .filter((deck) => !DIGITAL_TYPES.has(deck.type) && FILE_NAME_RE.test(deck.fileName))
      .map((deck) => ({
        fileName: deck.fileName,
        name: deck.name,
        code: deck.code,
        type: deck.type,
        releaseDate: deck.releaseDate ?? ''
      }))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name))
    index = { fetchedAt: Date.now(), data: decks }
    void writeCache('index.json', index)
    return decks
  } catch (error) {
    if (index) return index.data // stale, but fine offline
    throw error
  }
}

function toCard(card: any, board: PreconCard['board']): PreconCard | null {
  // Multi-faced cards may be listed once per face; keep the front.
  if (card.side && card.side !== 'a') return null
  return {
    qty: card.count ?? 1,
    name: simplifyCardName(card.name),
    set: String(card.setCode).toLowerCase().replace(/[^a-z0-9]/g, ''),
    collector: String(card.number),
    foil: Boolean(card.isFoil || card.isEtched),
    basic: (card.supertypes ?? []).includes('Basic') && (card.types ?? []).includes('Land'),
    ...(card.flavorName && { flavorName: card.flavorName }),
    board,
    scryfallId: card.identifiers?.scryfallId ?? null
  }
}

export async function getPrecon(fileName: string): Promise<PreconDeck> {
  if (!FILE_NAME_RE.test(fileName)) throw new Error('Invalid deck name.')
  const cacheFile = `deck-v${DECK_CACHE_VERSION}-${fileName}.json`
  const cached = await readCache<Cached<PreconDeck>>(cacheFile)
  if (cached && Date.now() - cached.fetchedAt < DECK_TTL_MS) return cached.data
  try {
    const { data } = await getJson(`${env().mtgjsonApi}/decks/${fileName}.json`)
    const cards = BOARDS.flatMap(([key, board]) =>
      ((data[key] ?? []) as any[]).map((card) => toCard(card, board)).filter((card): card is PreconCard => card !== null)
    )
    const deck: PreconDeck = {
      fileName,
      name: data.name,
      code: data.code,
      type: data.type,
      releaseDate: data.releaseDate ?? '',
      cards
    }
    void writeCache(cacheFile, { fetchedAt: Date.now(), data: deck } satisfies Cached<PreconDeck>)
    return deck
  } catch (error) {
    if (cached) return cached.data
    throw error
  }
}
