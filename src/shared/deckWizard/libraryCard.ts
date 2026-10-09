import type { CardInfo } from '../types'

/** A card of the local card library (one per Oracle card), for deckbuilding. */
export interface LibraryCard extends CardInfo {
  manaCost: string
  /** Oracle text, faces joined by newlines. */
  text: string
  /** Keyword abilities and ability words, e.g. `Landfall`, `Madness`. */
  keywords: string[]
  /** Cardmarket products of its paper printings: positive ids have a non-foil finish, negative ids are foil-only. */
  products: number[]
  /** How widely it's played in Commander, from Scryfall (EDHREC's rank; 1 = most played); absent if unranked. */
  edhrecRank?: number
  /** On the official list of Commander Game Changers. */
  gameChanger?: boolean
}
