import type { BracketCombo, BracketFacts } from './combos'
import { BRACKET_IDS, BRACKETS, type BracketId } from './deckBrief'
import { nameKey } from '../decklist'
import type { CardProfile } from './vocabulary'

/**
 * The Commander Brackets rules: what each power level allows (Game Changers, two-card combos,
 * land destruction, extra turns), whether a deck keeps to them, and the lowest bracket a deck
 * fits. The rules follow Wizards of the Coast's Commander Brackets as of 2025; they live in one
 * table, so a revision is a one-line change. Facts come from Commander Spellbook when it can be
 * reached, and from the cards' own rules text otherwise.
 *
 * @packageDocumentation
 */

/** What a bracket allows. */
export interface BracketRules {
  /** Most Game Changers; null for any number. */
  gameChangers: number | null
  /** Two-card combos: none, only ones that come together late, or any. */
  twoCardCombos: 'none' | 'late' | 'any'
  /** Cards that destroy or lock down many lands. */
  landDenial: boolean
  /** Most extra-turn cards, so turns aren't chained; null for any number. */
  extraTurns: number | null
}

/** The rules of each bracket. */
export const BRACKET_RULES: Record<BracketId, BracketRules> = {
  1: { gameChangers: 0, twoCardCombos: 'none', landDenial: false, extraTurns: 0 },
  2: { gameChangers: 0, twoCardCombos: 'none', landDenial: false, extraTurns: 1 },
  3: { gameChangers: 3, twoCardCombos: 'late', landDenial: false, extraTurns: 1 },
  4: { gameChangers: null, twoCardCombos: 'any', landDenial: true, extraTurns: null },
  5: { gameChangers: null, twoCardCombos: 'any', landDenial: true, extraTurns: null }
}

/**
 * Pieces costing this much mana in total or less make an early combo. Our own measure: the
 * brackets say "early game" without a number, and Commander Spellbook's speed doesn't tell.
 */
export const EARLY_COMBO_MANA = 6

/** A card as the bracket check reads it. */
export interface BracketCard {
  name: string
  gameChanger?: boolean
  profile?: CardProfile
}

/** A rule a deck breaks for a bracket. */
export interface BracketIssue {
  rule: 'game-changers' | 'two-card-combo' | 'land-denial' | 'extra-turns'
  cards: string[]
  /** In plain words, with the bracket's name. */
  message: string
}

/** A role at least this strong counts as the card doing it. */
const SURE = 0.8

/** @returns Bracket facts read from the cards alone, for when Commander Spellbook can't be reached. */
export function localFacts(cards: BracketCard[]): BracketFacts {
  const withRole = (role: 'land-denial' | 'extra-turn') =>
    cards.filter((c) => c.profile?.roles.some((r) => r.id === role && r.weight >= SURE)).map((c) => c.name)
  return {
    tag: null,
    gameChangers: cards.filter((c) => c.gameChanger).map((c) => c.name),
    massLandDenial: withRole('land-denial'),
    extraTurns: withRole('extra-turn'),
    combos: []
  }
}

/** @returns The facts of both readings: a card flagged by either counts. */
export function mergeFacts(local: BracketFacts, remote: BracketFacts | null): BracketFacts {
  if (!remote) return local
  const union = (a: string[], b: string[]) => {
    const seen = new Set(a.map(nameKey))
    return [...a, ...b.filter((name) => !seen.has(nameKey(name)))]
  }
  return {
    tag: remote.tag,
    gameChangers: union(local.gameChangers, remote.gameChangers),
    massLandDenial: union(local.massLandDenial, remote.massLandDenial),
    extraTurns: union(local.extraTurns, remote.extraTurns),
    combos: [...local.combos, ...remote.combos]
  }
}

/** "A, B and C". */
const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
/** "1 Game Changer", "3 Game Changers". */
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** "Bracket 3 · Upgraded". */
export const bracketName = (bracket: BracketId) => `Bracket ${bracket} · ${BRACKETS[bracket].label}`

/** @returns Whether a combo breaks a bracket's combo rule. */
export function comboBreaks(combo: BracketCombo, bracket: BracketId): boolean {
  const rule = BRACKET_RULES[bracket].twoCardCombos
  if (!combo.twoCard || rule === 'any') return false
  return rule === 'none' || combo.manaValue <= EARLY_COMBO_MANA
}

/** @returns The rules a deck breaks for a bracket, in plain words; none if it fits. */
export function bracketIssues(facts: BracketFacts, bracket: BracketId): BracketIssue[] {
  const rules = BRACKET_RULES[bracket]
  const name = bracketName(bracket)
  const issues: BracketIssue[] = []
  if (rules.gameChangers !== null && facts.gameChangers.length > rules.gameChangers) {
    const allowed = rules.gameChangers === 0 ? 'none' : `at most ${rules.gameChangers}`
    issues.push({
      rule: 'game-changers',
      cards: facts.gameChangers,
      message: `${count(facts.gameChangers.length, 'Game Changer')} (${listNames(facts.gameChangers)}); ${name} allows ${allowed}.`
    })
  }
  for (const combo of facts.combos.filter((c) => comboBreaks(c, bracket))) {
    const when = BRACKET_RULES[bracket].twoCardCombos === 'late' ? ' that comes together early' : ''
    issues.push({ rule: 'two-card-combo', cards: combo.cards, message: `A two-card combo${when}: ${listNames(combo.cards)}. ${name} doesn't allow it.` })
  }
  if (!rules.landDenial && facts.massLandDenial.length > 0) {
    issues.push({
      rule: 'land-denial',
      cards: facts.massLandDenial,
      message: `Land destruction (${listNames(facts.massLandDenial)}) isn't allowed in ${name}.`
    })
  }
  if (rules.extraTurns !== null && facts.extraTurns.length > rules.extraTurns) {
    const allowed = rules.extraTurns === 0 ? 'none' : `at most ${rules.extraTurns}, so turns aren't chained`
    issues.push({
      rule: 'extra-turns',
      cards: facts.extraTurns,
      message: `${count(facts.extraTurns.length, 'extra-turn card')} (${listNames(facts.extraTurns)}); ${name} allows ${allowed}.`
    })
  }
  return issues
}

/**
 * The lowest bracket a deck's cards fit. Bracket 1 differs from 2 by intent, not cards, and 5
 * from 4 by intent too, so the answer is 2, 3 or 4.
 * @returns The bracket, and why it can't be lower.
 */
export function bracketOf(facts: BracketFacts): { bracket: BracketId; reasons: string[] } {
  let reasons: string[] = []
  for (const bracket of BRACKET_IDS.slice(1, 3)) {
    const issues = bracketIssues(facts, bracket)
    if (issues.length === 0) return { bracket, reasons }
    reasons = issues.map((issue) => issue.message)
  }
  return { bracket: 4, reasons }
}
