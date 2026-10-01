/** The bits of a Scryfall card object needed to tell cards apart. */
export interface ScryfallCardLike {
  name: string
  oracle_id?: string
  card_faces?: Array<{ oracle_id?: string }>
}

const oracleOf = (card: ScryfallCardLike) => card.oracle_id ?? card.card_faces?.[0]?.oracle_id

const matchesName = (card: ScryfallCardLike, wanted: string) =>
  card.name.toLowerCase() === wanted || card.name.split(' // ')[0].toLowerCase() === wanted

/**
 * Whether any result is the named card itself (or its front face). Scryfall's
 * exact search also matches back faces and printed (flavor) names, e.g.
 * "Franklin's Finality" finds only the Marvel printings of Annie Joins Up.
 */
export function hasNamedCard(cards: ScryfallCardLike[], name: string): boolean {
  const wanted = name.trim().toLowerCase()
  return cards.some((card) => matchesName(card, wanted))
}

/**
 * Scryfall's exact-name search also matches card faces, so "Reanimate" returns
 * both Reanimate and "Grave Researcher // Reanimate". Keeps only the printings
 * of the card the name refers to: an exact full-name match, else a front-face
 * match (so "Delver of Secrets" finds the double-faced card), else the first result.
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
