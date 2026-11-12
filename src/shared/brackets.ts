import { listHeader, nameKey } from './decklist'
import { BRACKETS } from './deckWizard/averageDeck'
import type { ListLine } from './types'

/**
 * Commander Brackets: the five power levels Wizards of the Coast defines for Commander (beta, as of
 * the 9 February 2026 update), what each allows, and the lowest one a Deck's cards fit.
 *
 * The official rules, by bracket (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH):
 * - Game Changers: none in 1 and 2, up to three in 3, any in 4 and 5.
 * - Mass land denial: none below 4.
 * - Extra turns: none in 1; in 2 and 3 "low quantities", never chained or looped.
 * - Two-card infinite combos: none in 1 and 2; in 3 none early; any in 4 and 5.
 * - Tutors: no limit since October 2025, so they aren't checked.
 * Each bracket also says how long its games run: no win expected before turn 9, 8, 6, 4, any.
 *
 * Our readings, where the rules give no number:
 * - "Low quantities" of extra turns is up to {@link MAX_EXTRA_TURNS}; a combo that loops turns is chaining.
 * - A two-card combo counts when it ends the game: it wins, deals infinite damage or life loss, locks
 *   or takes over the table. The commander is a free piece: it is always there.
 * - A combo is early when the mana it needs is likely there before Bracket 3's sixth turn.
 * Cards can't tell 1 from 2 apart beyond extra turns, nor 4 from 5: those differ by intent. So the
 * answer is a floor, never a ceiling.
 *
 * @packageDocumentation
 */

/** A bracket, 1 to 5. */
export type BracketLevel = 1 | 2 | 3 | 4 | 5

/** The brackets, lowest first. */
export const BRACKET_LEVELS: BracketLevel[] = [1, 2, 3, 4, 5]

/** @returns A bracket's own name: `Upgraded`. */
export const bracketName = (level: BracketLevel): string => BRACKETS[level - 1].label

/** The turn before which a bracket's games aren't expected to end; null for any turn (cEDH). */
export const BRACKET_TURNS: Record<BracketLevel, number | null> = { 1: 9, 2: 8, 3: 6, 4: 4, 5: null }

/** Most extra-turn cards Brackets 2 and 3 allow: "low quantities". */
export const MAX_EXTRA_TURNS = 3

/** Brackets 1 to 3 allow no combo that comes together before this turn. */
export const EARLY_TURN = BRACKET_TURNS[3] as number

/** Most commanders sent to Commander Spellbook for one Deck. */
export const MAX_COMBO_COMMANDERS = 4
/** Most other cards sent to Commander Spellbook for one Deck. */
export const MAX_COMBO_CARDS = 600

/** A bracket rule a Deck can break. */
export type BracketRule = 'gameChangers' | 'combos' | 'landDenial' | 'extraTurns'

/** The rules, in the order shown. */
export const BRACKET_RULES: BracketRule[] = ['gameChangers', 'combos', 'landDenial', 'extraTurns']

/** A combo as Commander Spellbook describes it, before it is timed against a Deck. */
export interface SpellbookCombo {
  /** Commander Spellbook's id, for its page. */
  id: string
  /** Its cards, and whether each must already be on the battlefield (so its cost comes first). */
  pieces: { name: string; onBattlefield: boolean }[]
  /** Mana the combo needs to run, beyond the pieces already out. */
  manaNeeded: number
  /** What it does: `Win the game`, `Infinite damage`. */
  results: string[]
  /** Two cards, the commander not counted. */
  twoCard: boolean
  /** It ends the game: wins, drains, locks or takes over the table. */
  gameEnding: boolean
  /** It takes extra turns again and again. */
  extraTurns: boolean
  /** It denies many lands. */
  landDenial: boolean
}

/** Per-card bracket facts from Scryfall's tags and EDHREC's salt survey. */
export interface BracketCardData {
  /** Cards that deny many lands, by nameKey; null when unknown (offline, never fetched). */
  landDenial: string[] | null
  /** Cards that give extra turns, by nameKey; null when unknown. */
  extraTurns: string[] | null
  /** Salt, 0 to 4, by nameKey, for the saltier cards; null when unknown. */
  salt: Record<string, number> | null
}

/** Scryfall's tags: the per-card facts without salt. */
export type BracketTags = Omit<BracketCardData, 'salt'>

/** No data: offline with nothing cached. */
export const NO_CARD_DATA: BracketCardData = { landDenial: null, extraTurns: null, salt: null }

/** A combo timed against a Deck. */
export interface BracketCombo extends SpellbookCombo {
  /** Mana to assemble and run it: the pieces that must be out, plus what it needs. */
  mana: number
  /** The turn that mana is likely there by; null if never, or unknown. */
  turn: number | null
  /** It may come together before {@link EARLY_TURN}. */
  early: boolean
}

/** What a Deck holds that the brackets limit. */
export interface BracketFacts {
  gameChangers: string[]
  landDenial: string[]
  extraTurns: string[]
  /** Two-card combos that end the game; null while unchecked (offline). */
  combos: BracketCombo[] | null
  /** Combos of any size that loop extra turns or deny lands. */
  loops: { extraTurns: boolean; landDenial: boolean }
  /** Scryfall's tags are known: Land denial and extra turns were checked. */
  tagged: boolean
}

/** A Deck card as the facts read it. */
export interface BracketCard {
  name: string
  gameChanger?: boolean
}

/** Early combos first, then by the turn they come together; never last. */
const byTiming = (a: BracketCombo, b: BracketCombo) => Number(b.early) - Number(a.early) || (a.turn ?? 99) - (b.turn ?? 99)

/**
 * @param cards - The Deck's cards, commanders included.
 * @param combos - Commander Spellbook's combos, timed; null if unchecked.
 */
export function bracketFacts(cards: BracketCard[], data: BracketCardData, combos: BracketCombo[] | null): BracketFacts {
  const unique = [...new Map(cards.map((card) => [nameKey(card.name), card])).values()]
  const inTag = (keys: string[] | null) => {
    const set = new Set(keys ?? [])
    return unique.filter((card) => set.has(nameKey(card.name))).map((card) => card.name)
  }
  return {
    gameChangers: unique.filter((card) => card.gameChanger).map((card) => card.name),
    landDenial: inTag(data.landDenial),
    extraTurns: inTag(data.extraTurns),
    combos: combos && combos.filter((combo) => combo.twoCard && combo.gameEnding).sort(byTiming),
    loops: { extraTurns: !!combos?.some((combo) => combo.extraTurns), landDenial: !!combos?.some((combo) => combo.landDenial) },
    tagged: data.landDenial !== null && data.extraTurns !== null
  }
}

/**
 * @returns Whether a Deck keeps a rule at a bracket; null when it can't tell (combos unchecked).
 */
export function fitsRule(facts: BracketFacts, rule: BracketRule, level: BracketLevel): boolean | null {
  if (level >= 4) return true
  switch (rule) {
    case 'gameChangers':
      return facts.gameChangers.length <= (level === 3 ? 3 : 0)
    case 'landDenial':
      if (facts.loops.landDenial) return false
      return facts.tagged ? facts.landDenial.length === 0 : null
    case 'extraTurns':
      if (facts.loops.extraTurns) return false
      if (!facts.tagged) return null
      return facts.extraTurns.length <= (level === 1 ? 0 : MAX_EXTRA_TURNS)
    case 'combos': {
      const above = combosAbove(facts, level)
      return above === null ? null : above.length === 0
    }
  }
}

/** @returns The combos that keep a Deck out of a bracket: any below 3, the early ones at 3, none from 4; null while unchecked. */
export function combosAbove(facts: BracketFacts, level: BracketLevel): BracketCombo[] | null {
  if (!facts.combos) return null
  if (level >= 4) return []
  return level === 3 ? facts.combos.filter((combo) => combo.early) : facts.combos
}

/** @returns The lowest bracket whose every rule the Deck keeps, unchecked rules aside. */
export function bracketFloor(facts: BracketFacts): BracketLevel {
  return BRACKET_LEVELS.find((level) => BRACKET_RULES.every((rule) => fitsRule(facts, rule, level) !== false)) ?? 5
}

/**
 * @param checked - Every rule was checked: combos and tags are known.
 * @returns The floor as shown: `1–2` and `4–5` where only intent tells them apart, `3+` while a rule
 * is unchecked and could raise it.
 */
export function floorLabel(floor: BracketLevel, checked: boolean): string {
  if (floor >= 4) return '4–5'
  if (!checked) return `${floor}+`
  return floor === 1 ? '1–2' : String(floor)
}

/** @returns The rule a card breaks at a bracket, if any: what puts the Deck above it. */
export function cardBreaks(facts: BracketFacts, name: string, level: BracketLevel): BracketRule | null {
  if (level >= 4) return null
  const key = nameKey(name)
  const has = (names: string[]) => names.some((one) => nameKey(one) === key)
  if (has(facts.gameChangers) && !fitsRule(facts, 'gameChangers', level)) return 'gameChangers'
  const combos = combosAbove(facts, level) ?? []
  if (combos.some((combo) => combo.pieces.some((piece) => nameKey(piece.name) === key))) return 'combos'
  if (has(facts.landDenial)) return 'landDenial'
  if (has(facts.extraTurns) && !fitsRule(facts, 'extraTurns', level)) return 'extraTurns'
  return null
}

/**
 * Times a combo against a Deck.
 * @param manaValueOf - A card's mana value; null if unknown.
 * @param turnFor - The turn an amount of mana is likely there by; null if never.
 */
export function timeCombo(combo: SpellbookCombo, manaValueOf: (name: string) => number | null, turnFor: (mana: number) => number | null): BracketCombo {
  const mana = combo.manaNeeded + combo.pieces.reduce((sum, piece) => sum + (piece.onBattlefield ? (manaValueOf(piece.name) ?? 0) : 0), 0)
  const turn = turnFor(mana)
  return { ...combo, mana, turn, early: turn !== null && turn < EARLY_TURN }
}

/** A list's declared bracket: `// Bracket: 3`. A Deck property, kept in its file. */
const BRACKET = listHeader('Bracket')

/** @returns The bracket a list declares, by number or name; null if none. */
export function listBracket(lines: ListLine[]): BracketLevel | null {
  const value = BRACKET.read(lines)?.trim().toLowerCase()
  if (!value) return null
  const level = BRACKET_LEVELS.find((one) => value === String(one) || value === bracketName(one).toLowerCase() || value.startsWith(`${one} `))
  return level ?? null
}

/** Declares a list's bracket, or removes the header (`null`). */
export function withBracket(lines: ListLine[], level: BracketLevel | null): ListLine[] {
  // Written with the other Deck headers, before the first card.
  return BRACKET.write(lines, level === null ? null : String(level), (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}

/** A card's salt, by name. */
export interface Salty {
  name: string
  salt: number
}

/** A Deck's salt. */
export interface DeckSalt {
  /** The sum over its cards. */
  total: number
  /** Its cards, a copy each, salty or not. */
  cards: number
  /** Its saltiest cards, once each, most first. */
  saltiest: Salty[]
}

/**
 * @param names - The Deck's cards, a name a copy.
 * @returns Its salt; null when unknown.
 */
export function deckSalt(names: string[], salt: Record<string, number> | null, top = 4): DeckSalt | null {
  if (!salt) return null
  const scored = names.flatMap((name) => (salt[nameKey(name)] !== undefined ? [{ name, salt: salt[nameKey(name)] }] : []))
  const unique = [...new Map(scored.map((one) => [nameKey(one.name), one])).values()]
  return {
    total: Math.round(scored.reduce((sum, one) => sum + one.salt, 0) * 10) / 10,
    cards: names.length,
    saltiest: unique.sort((a, b) => b.salt - a.salt).slice(0, top)
  }
}

/**
 * @returns How much saltier a Deck is than another, in percent, card for card: an unfinished Deck
 * is measured by the cards it has. Null when either has no cards or the other no salt.
 */
export function saltVersus(deck: DeckSalt, other: DeckSalt): number | null {
  if (deck.cards === 0 || other.cards === 0 || other.total === 0) return null
  return Math.round(((deck.total / deck.cards) / (other.total / other.cards) - 1) * 100)
}
