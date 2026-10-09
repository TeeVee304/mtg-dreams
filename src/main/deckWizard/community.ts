import type { CommunityDeck } from '@shared/deckWizard/community'
import { readCacheFile, writeCacheFile } from '../cacheFiles'
import { getPrecon, getPreconIndex } from '../precons'

/**
 * Decks built by people for the wizard's statistics: the official Commander precons, through the
 * app's MTGJSON client. Each decklist is fetched once and kept, by name only, in one cache file;
 * new precons are added as MTGJSON lists them. Offline, the decks fetched so far are used.
 *
 * @packageDocumentation
 */

/** Cache file of the decks fetched so far. */
const CACHE_FILE = 'deckWizard/precons.json'
/** Cache schema version; bump to fetch every deck again. */
const CACHE_VERSION = 1
/** MTGJSON deck type of the Commander precons. */
const COMMANDER_DECK = 'Commander Deck'
/** Decklists fetched at once. */
const CONCURRENCY = 4

/** The cache file's contents. */
interface Cache {
  version: number
  /** Decks by MTGJSON file name. */
  decks: Record<string, CommunityDeck>
}

let decks: CommunityDeck[] | null = null
let loading: Promise<CommunityDeck[]> | null = null

/** @returns Whether precons are loading. */
export const communityLoading = (): boolean => loading !== null

/** @returns The decks loaded so far, without waiting; null before any are. */
export function communityDecks(): CommunityDeck[] | null {
  return decks
}

/**
 * Loads the precons: those cached, then any MTGJSON lists that aren't, a few at a time. Never
 * rejects: a deck that can't be fetched is tried again next time.
 * @returns Every precon loaded.
 */
export function loadCommunityDecks(): Promise<CommunityDeck[]> {
  loading ??= load().finally(() => (loading = null))
  return loading
}

async function load(): Promise<CommunityDeck[]> {
  const cached = await readCacheFile<Cache>(CACHE_FILE)
  const known: Record<string, CommunityDeck> = cached?.version === CACHE_VERSION ? cached.decks : {}
  decks = Object.values(known)
  let index: string[]
  try {
    index = (await getPreconIndex()).filter((deck) => deck.type === COMMANDER_DECK).map((deck) => deck.fileName)
  } catch {
    return decks
  }
  const missing = index.filter((fileName) => !known[fileName])
  let added = 0
  const next = async (): Promise<void> => {
    const fileName = missing.shift()
    if (!fileName) return
    try {
      const precon = await getPrecon(fileName)
      const of = (board: string) => precon.cards.filter((card) => card.board === board).map((card) => card.name)
      known[fileName] = { id: fileName, name: precon.name, commanders: of('commander'), cards: of('main') }
      added++
    } catch {
      // Tried again next time.
    }
    return next()
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next))
  decks = Object.values(known)
  if (added > 0) await writeCacheFile(CACHE_FILE, { version: CACHE_VERSION, decks: known } satisfies Cache)
  return decks
}

/** Forgets the decks loaded, for tests. */
export function clearCommunityMemory(): void {
  decks = null
}
