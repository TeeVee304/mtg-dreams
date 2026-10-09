import { bracketIssues, bracketOf, localFacts, mergeFacts, type BracketCard } from './brackets'
import type { BracketFacts, Combo } from './combos'
import { BRACKETS, type BracketId } from './deckBrief'
import { nameKey } from '../decklist'
import { exclusion, isLand, type CandidatePool } from './deckPool'
import type { DeckTemplate, SlotRole } from './deckTemplate'
import { SLOT_ROLES } from './deckTemplate'
import { colorPips, landColors } from './manaBase'
import { ROLES, type CardProfile } from './mechanics'
import type { LibraryCard } from './libraryCard'

/**
 * The deck report: what a finished deck looks like as a whole, to teach as much as to check. Its
 * curve, how surely it can cast its colors (exact odds of drawing enough lands of each color), how
 * many cards do each job, its power level by the Commander Brackets, and how it runs alone (a
 * seeded "goldfish" of solo games: land drops and casting the commander on curve).
 *
 * @packageDocumentation
 */

/** A card of the deck as the report reads it. */
export interface ReportCard {
  card: LibraryCard
  profile: CardProfile
  qty: number
}

/** Cards in a Commander deck besides the commander. */
const LIBRARY_SIZE = 99
/** Cards in the opening hand. */
const HAND = 7
/** Highest mana value with its own curve column; higher ones join it. */
export const CURVE_TOP = 7
/** Chance to cast a color's cards on curve that counts as enough. */
export const GOOD_CHANCE = 0.9
/** A card does a job when its role is at least this strong. */
const JOB_STRENGTH = 0.8
/** Solo games played for the goldfish. */
const GAMES = 2000

/** How surely the deck casts one color's cards. */
export interface ColorOdds {
  color: string
  /** Colored symbols of that color among the deck's spells. */
  pips: number
  /** Lands that make the color. */
  sources: number
  /** The card asking most of it, as "{G}{G} by turn 3". */
  hardest: { name: string; pips: number; turn: number }
  /** Chance of having enough sources by then, 0 to 1. */
  chance: number
}

/** How many cards do a job, against the plan. */
export interface JobCount {
  role: SlotRole
  label: string
  plain?: string
  explain: string
  /** Cards doing it, a card doing two jobs counting for both. */
  count: number
  /** Cards the plan asks for. */
  target: number
}

/** The report. */
export interface DeckReport {
  /** Spells per mana value, 0 to {@link CURVE_TOP} (or more). */
  curve: number[]
  averageManaValue: number
  lands: number
  colors: ColorOdds[]
  jobs: JobCount[]
  power: {
    /** The bracket the player asked for. */
    target: BracketId
    /** The lowest bracket the cards fit, and why not lower. */
    estimate: BracketId
    reasons: string[]
    /** Rules broken for the target bracket, in plain words. */
    issues: string[]
    gameChangers: string[]
    combos: Combo[]
    /** Commander Spellbook's tag for the deck; null offline. */
    spellbookTag: string | null
  }
  /** The most played cards for the deck's colors, from the precons; null without them. */
  staples: StapleReport | null
  goldfish: {
    /** Chance of playing a land each turn through turn 4. */
    landDrops: number
    /** Chance of casting the commander the turn its mana value says, or sooner. */
    commanderOnCurve: number
    /** The commander's mana value. */
    commanderTurn: number
  }
}

/** The most played cards for the deck's colors, in the deck or not. */
export interface StapleReport {
  /** Precons the rates come from. */
  decks: number
  cards: Array<{
    name: string
    /** Share of precons that could play it that do. */
    rate: number
    inDeck: boolean
    /** Why it isn't in the deck, in plain words. */
    why?: string
  }>
}

/** Staples listed in the report. */
const STAPLES_SHOWN = 10
/** Least staple rate for a card to be listed. */
const STAPLE_RATE = 0.3

/**
 * The precons' most played cards for the deck's colors, and for each one missing, why: the
 * budget, the bracket or the player left it out, or other cards did its job better.
 * @param lookup - The card and what it does, by name.
 * @param price - A card's price on the brief's basis; null if unknown.
 */
export function stapleReport(
  pool: CandidatePool,
  deck: string[],
  lookup: (name: string) => { card: LibraryCard; profile: CardProfile } | undefined,
  price: (card: LibraryCard) => number | null
): StapleReport | null {
  const stats = pool.community
  if (!stats) return null
  const inDeck = new Set(deck.map(nameKey))
  const cards = stats.staples
    .filter((staple) => staple.rate >= STAPLE_RATE)
    .slice(0, STAPLES_SHOWN)
    .map(({ name, rate }) => {
      if (inDeck.has(nameKey(name))) return { name, rate, inDeck: true }
      const known = lookup(name)
      const out = known && !pool.eligible.has(nameKey(name)) ? exclusion(known.card, known.profile, price(known.card), pool) : null
      return { name, rate, inDeck: false, why: out?.message ?? 'Other cards did its job better for this plan.' }
    })
  return { decks: stats.decks, cards }
}

/** Logarithm of n choose k. */
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  let sum = 0
  for (let i = 1; i <= k; i++) sum += Math.log(n - k + i) - Math.log(i)
  return sum
}

/**
 * Hypergeometric odds: the chance of at least `want` successes among `draws` cards from a deck of
 * `size` holding `successes`.
 */
export function atLeast(want: number, draws: number, successes: number, size: number): number {
  if (want <= 0) return 1
  let below = 0
  for (let k = 0; k < want; k++) below += Math.exp(logChoose(successes, k) + logChoose(size - successes, draws - k) - logChoose(size, draws))
  return Math.max(0, Math.min(1, 1 - below))
}

/** Cards seen by a turn, on the draw: the opening hand and one draw a turn. */
const seenBy = (turn: number) => HAND + turn

/** Odds for each color of the commander's identity that the spells use. */
function colorOdds(cards: ReportCard[], identity: string[]): ColorOdds[] {
  const lands = cards.filter((c) => isLand(c.card))
  const spells = cards.filter((c) => !isLand(c.card))
  return identity.flatMap((color) => {
    const sources = lands.reduce((sum, c) => sum + (landColors(c.card).has(color) ? c.qty : 0), 0)
    let pips = 0
    let hardest: ColorOdds['hardest'] | null = null
    let chance = 1
    for (const { card, qty } of spells) {
      const need = Math.ceil(colorPips(card.manaCost.split(' // ')[0])[color] ?? 0)
      if (need === 0) continue
      pips += need * qty
      const turn = Math.max(1, Math.min(card.manaValue, 10))
      const odds = atLeast(need, seenBy(turn), sources, LIBRARY_SIZE)
      if (odds < chance || !hardest) [chance, hardest] = [odds, { name: card.name, pips: need, turn }]
    }
    return hardest ? [{ color, pips, sources, hardest, chance }] : []
  })
}

/** Jobs of the plan's role slots, counted over the deck. */
function jobCounts(cards: ReportCard[], template: DeckTemplate): JobCount[] {
  return SLOT_ROLES.flatMap((role) => {
    const target = template.slots.find((slot) => slot.id === role)?.count ?? 0
    const count = cards.reduce((sum, c) => sum + (!isLand(c.card) && c.profile.roles.some((r) => r.id === role && r.weight >= JOB_STRENGTH) ? c.qty : 0), 0)
    if (target === 0 && count === 0) return []
    const { label, plain, explain } = ROLES[role]
    return [{ role, label, ...(plain && { plain }), explain, count, target }]
  })
}

/** A seeded random number generator (mulberry32): the same games every time. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Solo games: land drops through turn 4, and the commander cast on curve, mana rocks and dorks helping. */
function goldfish(cards: ReportCard[], commander: LibraryCard): DeckReport['goldfish'] {
  // Each card is a land, a cheap mana source (rock or dork, with its cost), or something else.
  type Kind = { land: true } | { land: false; ramp: number | null }
  const deck: Kind[] = []
  for (const { card, profile, qty } of cards) {
    const ramp = profile.roles.some((r) => r.id === 'ramp' && r.weight >= 0.8) && card.manaValue <= 3 && !/Instant|Sorcery/.test(card.typeLine)
    for (let i = 0; i < qty; i++) deck.push(isLand(card) ? { land: true } : { land: false, ramp: ramp ? card.manaValue : null })
  }
  while (deck.length < LIBRARY_SIZE) deck.push({ land: false, ramp: null })
  const next = random(99)
  const commanderTurn = Math.max(1, commander.manaValue)
  const turns = Math.max(4, commanderTurn)
  let drops = 0
  let onCurve = 0
  for (let game = 0; game < GAMES; game++) {
    const order = [...deck]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const hand = order.slice(0, HAND)
    let drawn = HAND
    let lands = 0
    let rocks = 0
    let missed = false
    let cast = false
    for (let turn = 1; turn <= turns; turn++) {
      hand.push(order[drawn++])
      const land = hand.findIndex((c) => c.land)
      if (land >= 0) {
        hand.splice(land, 1)
        lands++
      } else if (turn <= 4) missed = true
      let mana = lands + rocks
      if (turn <= commanderTurn && mana >= commanderTurn) cast = true
      // Cheap mana sources go down whenever they can, cheapest first.
      const sources = hand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !c.land && c.ramp !== null)
        .sort((a, b) => (a.c as { ramp: number }).ramp - (b.c as { ramp: number }).ramp)
      for (const { c } of sources) {
        const cost = (c as { ramp: number }).ramp
        if (cost > mana) break
        mana -= cost
        rocks++
        hand.splice(hand.indexOf(c), 1)
      }
    }
    if (!missed) drops++
    if (cast) onCurve++
  }
  return { landDrops: drops / GAMES, commanderOnCurve: onCurve / GAMES, commanderTurn }
}

/**
 * The report for a deck.
 * @param cards - The 99 with what each does.
 * @param commander - The commander, outside the 99.
 * @param spellbook - Commander Spellbook's facts and combos for the deck; nulls offline.
 */
export function deckReport(
  cards: ReportCard[],
  commander: { card: LibraryCard; profile: CardProfile },
  template: DeckTemplate,
  target: BracketId,
  spellbook: { facts: BracketFacts | null; combos: Combo[] } = { facts: null, combos: [] },
  staples: StapleReport | null = null
): DeckReport {
  const spells = cards.filter((c) => !isLand(c.card))
  const curve = Array.from({ length: CURVE_TOP + 1 }, () => 0)
  let manaValues = 0
  let spellCount = 0
  for (const { card, qty } of spells) {
    curve[Math.min(CURVE_TOP, Math.floor(card.manaValue))] += qty
    manaValues += card.manaValue * qty
    spellCount += qty
  }
  const bracketCards: BracketCard[] = [commander, ...cards].map((c) => ({ name: c.card.name, gameChanger: c.card.gameChanger, profile: c.profile }))
  const facts = mergeFacts(localFacts(bracketCards), spellbook.facts)
  const estimate = bracketOf(facts)
  return {
    curve,
    averageManaValue: spellCount > 0 ? manaValues / spellCount : 0,
    lands: cards.filter((c) => isLand(c.card)).reduce((sum, c) => sum + c.qty, 0),
    colors: colorOdds(cards, commander.card.colorIdentity),
    jobs: jobCounts(cards, template),
    power: {
      target,
      estimate: estimate.bracket,
      reasons: estimate.reasons,
      issues: bracketIssues(facts, target).map((issue) => issue.message),
      gameChangers: facts.gameChangers,
      combos: spellbook.combos,
      spellbookTag: facts.tag
    },
    staples,
    goldfish: goldfish(cards, commander.card)
  }
}

/** "Bracket 3 · Upgraded". */
export const bracketLabel = (bracket: BracketId) => `Bracket ${bracket} · ${BRACKETS[bracket].label}`
