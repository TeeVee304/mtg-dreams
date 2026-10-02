/** Scryfall card fields needed to identify a card. */
export interface ScryfallCardLike {
  name: string
  oracle_id?: string
  card_faces?: Array<{ oracle_id?: string }>
}

/** Oracle id, from the card or its first face. */
const oracleOf = (card: ScryfallCardLike) => card.oracle_id ?? card.card_faces?.[0]?.oracle_id

/** Full-name or front-face match against a lower-case name. */
const matchesName = (card: ScryfallCardLike, wanted: string) =>
  card.name.toLowerCase() === wanted || card.name.split(' // ')[0].toLowerCase() === wanted

/**
 * Detects whether Scryfall exact-search results contain the named card (full name or front face),
 * as opposed to only back-face or flavor-name matches.
 * @returns Whether any result is the named card.
 */
export function hasNamedCard(cards: ScryfallCardLike[], name: string): boolean {
  const wanted = name.trim().toLowerCase()
  return cards.some((card) => matchesName(card, wanted))
}

/**
 * Filters Scryfall exact-search results (which also match faces) to one card's printings.
 * Target: exact full-name match, else front-face match, else the first result; then all
 * results sharing its oracle id.
 */
export function printingsOfNamedCard<T extends ScryfallCardLike>(cards: T[], name: string): T[] {
  if (cards.length === 0) return cards
  const wanted = name.trim().toLowerCase()
  const match =
    cards.find((card) => card.name.toLowerCase() === wanted) ??
    cards.find((card) => card.name.split(' // ')[0].toLowerCase() === wanted) ??
    cards[0]
  const oracle = oracleOf(match)
  return oracle ? cards.filter((card) => oracleOf(card) === oracle) : [match]
}
