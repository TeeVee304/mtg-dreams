import { simplifyCardName } from '@shared/precons'
import type { PreconCard, PreconDeck, PreconSummary } from '@shared/types'
import { cachedFetch } from './cacheFiles'
import { env } from './environment'
import { fetchJson } from './http'

/**
 * Official precon decklists from MTGJSON, cached under `userData/precons/`. Stale cache is served
 * when offline.
 *
 * @packageDocumentation
 */

/** Deck index cache TTL. */
const INDEX_TTL_MS = 24 * 60 * 60 * 1000
/** Decklist cache TTL; weekly, since upcoming decklists may be corrected. */
const DECK_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Allowed MTGJSON deck file names (also guards URL and path construction). */
const FILE_NAME_RE = /^[A-Za-z0-9_-]+$/
/** Deck cache schema version; bump to invalidate cached decks. */
const DECK_CACHE_VERSION = 3

/** MTGJSON deck types of digital-only products (excluded). */
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

/** MTGJSON board keys mapped to {@link PreconCard} boards. */
const BOARDS: Array<[string, PreconCard['board']]> = [
  ['commander', 'commander'],
  ['mainBoard', 'main'],
  ['sideBoard', 'side'],
  ['planes', 'other'],
  ['schemes', 'other']
]

/** @throws Error on HTTP error status or non-JSON body. */
async function getJson(url: string): Promise<any> {
  const res = await fetchJson(url, 'MTGJSON')
  if (res.status >= 400 || res.data === null) throw new Error(`MTGJSON responded with HTTP ${res.status}.`)
  return res.data
}

/** @returns Paper precons, newest first. Cached for {@link INDEX_TTL_MS}. */
export function getPreconIndex(): Promise<PreconSummary[]> {
  return cachedFetch('precons/index.json', INDEX_TTL_MS, async () => {
    const body = await getJson(`${env().mtgjsonApi}/DeckList.json`)
    return (body.data as any[])
      .filter((deck) => !DIGITAL_TYPES.has(deck.type) && FILE_NAME_RE.test(deck.fileName))
      .map(
        (deck): PreconSummary => ({
          fileName: deck.fileName,
          name: deck.name,
          code: deck.code,
          type: deck.type,
          releaseDate: deck.releaseDate ?? ''
        })
      )
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name))
  })
}

/** Maps an MTGJSON card; null for non-front faces of multi-faced cards. */
function toCard(card: any, board: PreconCard['board']): PreconCard | null {
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

/**
 * @param fileName - MTGJSON deck file name.
 * @throws Error if `fileName` is invalid, or the fetch fails without a cached copy.
 */
export async function getPrecon(fileName: string): Promise<PreconDeck> {
  if (!FILE_NAME_RE.test(fileName)) throw new Error('Invalid deck name.')
  return cachedFetch(`precons/deck-v${DECK_CACHE_VERSION}-${fileName}.json`, DECK_TTL_MS, () => fetchPrecon(fileName))
}

/**
 * Fetches a decklist without caching it, for callers that keep their own copy.
 * @param fileName - MTGJSON deck file name.
 * @throws Error if `fileName` is invalid, or the fetch fails.
 */
export async function fetchPrecon(fileName: string): Promise<PreconDeck> {
  if (!FILE_NAME_RE.test(fileName)) throw new Error('Invalid deck name.')
  const { data } = await getJson(`${env().mtgjsonApi}/decks/${fileName}.json`)
  return {
    fileName,
    name: data.name,
    code: data.code,
    type: data.type,
    releaseDate: data.releaseDate ?? '',
    cards: BOARDS.flatMap(([key, board]) =>
      ((data[key] ?? []) as any[]).map((card) => toCard(card, board)).filter((card): card is PreconCard => card !== null)
    )
  }
}
