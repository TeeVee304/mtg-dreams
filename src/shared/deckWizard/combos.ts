import { nameKey } from '../decklist'

/**
 * Combos and bracket facts from Commander Spellbook (commanderspellbook.com), the open database of
 * Commander combos: cards that win or loop together, and which cards and combos the Commander
 * Brackets restrict. The parsers turn its API answers into the compact shapes the wizard keeps.
 *
 * @packageDocumentation
 */

/** Commander Spellbook's power tags, from its bracket estimate. */
export const SPELLBOOK_TAGS = {
  E: 'Exhibition',
  C: 'Core',
  O: 'Oddball',
  P: 'Powerful',
  S: 'Spicy',
  R: 'Ruthless',
  B: 'Banned'
} as const

/** Commander Spellbook power tag. */
export type SpellbookTag = keyof typeof SPELLBOOK_TAGS

/** Cards that win or loop together. */
export interface Combo {
  id: string
  /** Card names, the commander included when it's a piece. */
  cards: string[]
  /** What it makes happen: "Infinite creature tokens with haste". */
  results: string[]
  /** How it works, step by step. */
  steps: string
  /** Total mana value of the pieces: how early it can come together. */
  manaValue: number
  /** How many decks play it; higher is better known. */
  popularity: number
}

/** A combo missing some cards from the list searched. */
export interface NearCombo extends Combo {
  missing: string[]
}

/** Combos among a list of cards. */
export interface ComboSearch {
  /** Every piece is in the list. */
  included: Combo[]
  /** One piece away, in the deck's colors. */
  near: NearCombo[]
}

/** A combo the Commander Brackets count. */
export interface BracketCombo {
  cards: string[]
  /** Two cards win or loop on their own. */
  twoCard: boolean
  /** Locks opponents out of the game. */
  lock: boolean
  manaValue: number
}

/** What Commander Spellbook says about a list of cards, for the bracket rules. */
export interface BracketFacts {
  /** Its estimate for the whole list; null if it gave none. */
  tag: SpellbookTag | null
  gameChangers: string[]
  /** Cards that destroy or lock down many lands. */
  massLandDenial: string[]
  extraTurns: string[]
  combos: BracketCombo[]
}

/** Card names a combo uses. */
const cardsOf = (raw: any): string[] =>
  (Array.isArray(raw?.uses) ? raw.uses : []).map((use: any) => use?.card?.name).filter((name: unknown): name is string => typeof name === 'string')

/** @returns The combo from a Commander Spellbook variant; null if it has no cards. */
export function parseCombo(raw: any): Combo | null {
  const cards = cardsOf(raw)
  if (typeof raw?.id !== 'string' || cards.length === 0) return null
  return {
    id: raw.id,
    cards,
    results: (Array.isArray(raw.produces) ? raw.produces : []).map((p: any) => p?.feature?.name).filter((n: unknown): n is string => typeof n === 'string'),
    steps: typeof raw.description === 'string' ? raw.description : '',
    manaValue: typeof raw.manaValueNeeded === 'number' ? raw.manaValueNeeded : 0,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0
  }
}

/**
 * @param data - Answer of `find-my-combos`.
 * @param names - The cards searched, to tell which pieces a near combo misses.
 * @returns The combos; null for an unexpected answer.
 */
export function parseComboSearch(data: any, names: string[]): ComboSearch | null {
  const results = data?.results
  if (!results || !Array.isArray(results.included)) return null
  const have = new Set(names.map(nameKey))
  const near: NearCombo[] = []
  for (const raw of Array.isArray(results.almostIncluded) ? results.almostIncluded : []) {
    const combo = parseCombo(raw)
    if (!combo) continue
    const missing = combo.cards.filter((card) => !have.has(nameKey(card)))
    if (missing.length === 1) near.push({ ...combo, missing })
  }
  return { included: results.included.map(parseCombo).filter((c: Combo | null): c is Combo => c !== null), near }
}

/** @returns The facts from an `estimate-bracket` answer; null for an unexpected answer. */
export function parseBracketFacts(data: any): BracketFacts | null {
  if (!data || !Array.isArray(data.cards) || !Array.isArray(data.combos)) return null
  const flagged = (flag: string) =>
    data.cards.filter((c: any) => c?.[flag] === true && typeof c?.card?.name === 'string').map((c: any) => c.card.name as string)
  return {
    tag: typeof data.bracketTag === 'string' && Object.hasOwn(SPELLBOOK_TAGS, data.bracketTag) ? (data.bracketTag as SpellbookTag) : null,
    gameChangers: flagged('gameChanger'),
    massLandDenial: flagged('massLandDenial'),
    extraTurns: flagged('extraTurn'),
    combos: data.combos
      .filter((c: any) => c?.relevant !== false)
      .map((c: any) => ({
        cards: cardsOf(c.combo),
        twoCard: c.definitelyTwoCard === true,
        lock: c.lock === true,
        manaValue: typeof c.combo?.manaValueNeeded === 'number' ? c.combo.manaValueNeeded : 0
      }))
      .filter((c: BracketCombo) => c.cards.length > 0)
  }
}

/** @returns The combos all of whose cards are among `names`. */
export function combosIn<T extends { cards: string[] }>(combos: T[], names: Iterable<string>): T[] {
  const have = new Set([...names].map(nameKey))
  return combos.filter((combo) => combo.cards.every((card) => have.has(nameKey(card))))
}
