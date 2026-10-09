import type { LibraryCard } from './libraryCard'

/**
 * How strong a card is in Commander, from 0 to 1, measured by how widely it's played across all
 * Commander decks (EDHREC's rank, as Scryfall reports it). Popularity across every deck stands in
 * for power only: it says nothing about which deck a card belongs in, which is the card reader's
 * job. Game Changers, the official list of the format's strongest cards, rank near the top.
 *
 * @packageDocumentation
 */

/** About the rank of the least-played ranked cards. */
const LOWEST_RANK = 30_000
/** Strength of a card without a rank: usually a new card nobody has played yet. */
export const UNRANKED_STRENGTH = 0.4
/** The least strength of a Game Changer. */
const GAME_CHANGER_FLOOR = 0.9

/**
 * @returns 1 for the most-played card, about 0.8 for the 100th, 0.55 for the 1,000th, 0.2 for the
 * 10,000th; {@link UNRANKED_STRENGTH} without a rank; at least 0.9 for Game Changers.
 */
export function cardStrength(card: Pick<LibraryCard, 'edhrecRank' | 'gameChanger'>): number {
  let strength = UNRANKED_STRENGTH
  if (card.edhrecRank !== undefined) {
    // Squaring the log keeps the well-played middle apart: rank 1,000 is still a fine card.
    const depth = Math.log(Math.max(1, card.edhrecRank)) / Math.log(LOWEST_RANK)
    strength = Math.min(1, Math.max(0, 1 - depth ** 2))
  }
  return card.gameChanger ? Math.max(GAME_CHANGER_FLOOR, strength) : strength
}
