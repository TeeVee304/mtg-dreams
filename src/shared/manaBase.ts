import { CURVE_TOP, frontTypeWords } from './cards'
import { pipsOf, STAT_COLORS, type StatColor } from './deckStats'
import type { CardInfo } from './types'

/**
 * A Deck's mana base against its spells, with exact draw odds (hypergeometric): the chance of making
 * each land drop on time, its ramp, the Lands Frank Karsten's formulas suggest, and the sources each
 * color needs.
 *
 * At a multiplayer table draws are on the draw, as for 3 players of 4 in a Commander game: by turn t
 * you have seen 7 + t cards. With 2 players they are on the play, the stricter half: 6 + t cards.
 * The commanders start in the command zone, so the library is the rest of the main deck.
 *
 * @packageDocumentation
 */

/** Input row: a main deck line with its card data; `leader` for a commander. */
export interface ManaRow {
  line: { name: string; qty: number }
  /** Card data; undefined while loading, null if unknown. */
  info?: CardInfo | null
  leader?: boolean
}

/** What one color asks of the mana base. */
export interface ColorNeed {
  color: StatColor
  /** Colored pips of that color in the Deck's costs, copies counted. */
  pips: number
  /** Lands and mana rocks or creatures making that color, copies counted. */
  sources: number
  /** Sources that cast the most demanding card on curve 9 times in 10 ({@link CAST_CHANCE}). */
  target: number
  /** That card. */
  card: string
  /** The turn it is cast on: its mana value. */
  turn: number
}

/** The game a Deck is built for: its format's size and players. */
export interface Table {
  deckSize: number
  players: number
}

/** A Deck's mana base, from {@link manaBase}. */
export interface ManaBase {
  /** Library cards: the main deck, commanders aside. */
  library: number
  lands: number
  ramp: { rocks: number; creatures: number; searches: number; total: number; cheap: number }
  /** Chance of having played t Lands by turn t, for t from 1 to {@link CURVE_TOP} (index t − 1). */
  onTime: number[]
  /** The same, counting ramp of mana value 2 or less as Lands. */
  onTimeRamp: number[]
  /** Lands Karsten's formula suggests; null outside 100- and 60-card formats or without spells. */
  suggestedLands: number | null
  /** That formula, for its explanation; null without one. */
  formula: LandFormula | null
  /** Colors with pips, WUBRG order. */
  colors: ColorNeed[]
}

/** The chance of casting a card on curve that a color's target aims for. */
export const CAST_CHANCE = 0.9
/** Ramp this cheap counts as cheap ramp. */
const CHEAP = 2

/** @returns ln C(n, k). */
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  let sum = 0
  for (let i = 1; i <= k; i++) sum += Math.log((n - k + i) / i)
  return sum
}

/** @returns The chance of at least `k` hits in `n` draws from `size` cards holding `hits`. */
export function atLeast(size: number, hits: number, n: number, k: number): number {
  const draws = Math.min(n, size)
  let p = 0
  for (let x = Math.max(0, k); x <= Math.min(draws, hits); x++) {
    p += Math.exp(logChoose(hits, x) + logChoose(size - hits, draws - x) - logChoose(size, draws))
  }
  return Math.min(1, p)
}

/** @returns Cards seen by turn `turn`: on the play, the first turn draws none. */
const seen = (turn: number, onPlay: boolean) => (onPlay ? 6 : 7) + turn

/** @returns The chance of having played t Lands by turn t; on the draw unless `onPlay`. */
export const landsOnTime = (library: number, lands: number, turn: number, onPlay = false) => atLeast(library, lands, seen(turn, onPlay), turn)

/**
 * The chance of having `pips` sources of a color by turn `turn`, given you have made your land drops
 * (at least `turn` mana sources in hand): Karsten's way of counting colored sources.
 * @param sources - All mana sources: Lands and mana rocks or creatures.
 * @param colored - Those making the color.
 */
export function colorOnTime(library: number, sources: number, colored: number, pips: number, turn: number, onPlay = false): number {
  const n = Math.min(seen(turn, onPlay), library)
  const other = sources - colored
  const rest = library - sources
  const total = logChoose(library, n)
  let both = 0
  let enough = 0
  for (let c = 0; c <= Math.min(colored, n); c++) {
    for (let o = 0; o <= Math.min(other, n - c); o++) {
      if (c + o < turn) continue
      const p = Math.exp(logChoose(colored, c) + logChoose(other, o) + logChoose(rest, n - c - o) - total)
      enough += p
      if (c >= pips) both += p
    }
  }
  return enough > 0 ? both / enough : 0
}

/** @returns Colored sources casting a card with `pips` of a color on turn `turn` {@link CAST_CHANCE} of the time; all sources if none do. */
export function sourcesNeeded(library: number, sources: number, pips: number, turn: number, onPlay = false): number {
  for (let colored = pips; colored <= sources; colored++) {
    if (colorOnTime(library, sources, colored, pips, turn, onPlay) >= CAST_CHANCE) return colored
  }
  return sources
}

const isLand = (info: CardInfo) => frontTypeWords(info.typeLine).includes('Land')

/**
 * Karsten's land formulas by deck size: 100 cards (Commander) and 60, each less 0.28 a cheap ramp piece.
 * Both also count cheap card draw, which the app doesn't tell apart, so they can run about a Land high.
 */
const LAND_FORMULAS: LandFormula[] = [
  { deckSize: 100, base: 31.42, perManaValue: 3.13 },
  { deckSize: 60, base: 19.59, perManaValue: 1.9 }
]

/** A land formula: base + perManaValue × average mana value − 0.28 × cheap ramp. */
export interface LandFormula {
  deckSize: number
  base: number
  perManaValue: number
}

/**
 * @param table - The format's size and players; null for a Deck of no format: on the draw, no suggestion.
 * @param averageManaValue - Average mana value of the spells.
 */
export function manaBase(rows: ManaRow[], table: Table | null, averageManaValue: number | null): ManaBase {
  const onPlay = table?.players === 2
  const formula = LAND_FORMULAS.find((one) => one.deckSize === table?.deckSize) ?? null
  const library = rows.filter((row) => !row.leader)
  const size = library.reduce((sum, row) => sum + row.line.qty, 0)
  const ramp = { rocks: 0, creatures: 0, searches: 0, total: 0, cheap: 0 }
  let lands = 0
  /** Lands and mana rocks or creatures: what counts as a source of mana. */
  let sources = 0
  const colored: Record<StatColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const { line, info } of library) {
    if (!info) continue
    const qty = line.qty
    if (isLand(info)) lands += qty
    if (info.ramp) {
      ramp[info.ramp === 'rock' ? 'rocks' : info.ramp === 'creature' ? 'creatures' : 'searches'] += qty
      ramp.total += qty
      if (info.manaValue <= CHEAP) ramp.cheap += qty
    }
    if (isLand(info) || info.ramp === 'rock' || info.ramp === 'creature') {
      sources += qty
      for (const color of STAT_COLORS) if (info.produces?.includes(color)) colored[color] += qty
    }
  }

  const turns = Array.from({ length: CURVE_TOP }, (_, i) => i + 1)
  const onTime = turns.map((turn) => landsOnTime(size, lands, turn, onPlay))
  const onTimeRamp = turns.map((turn) => landsOnTime(size, Math.min(size, lands + ramp.cheap), turn, onPlay))

  // Each color's target: the most sources any of its cards needs, commanders included.
  const needs = new Map<StatColor, ColorNeed>()
  const memo = new Map<string, number>()
  for (const { line, info } of rows) {
    if (!info || isLand(info) || !info.manaCost) continue
    const pips = pipsOf(info.manaCost)
    const turn = Math.max(1, Math.min(CURVE_TOP, Math.round(info.manaValue)))
    for (const color of STAT_COLORS) {
      if (pips[color] === 0) continue
      const key = `${pips[color]}|${turn}`
      if (!memo.has(key)) memo.set(key, sourcesNeeded(size, sources, pips[color], turn, onPlay))
      const target = memo.get(key)!
      const need = needs.get(color) ?? { color, pips: 0, sources: colored[color], target: 0, card: line.name, turn }
      need.pips += pips[color] * line.qty
      if (target > need.target) Object.assign(need, { target, card: line.name, turn })
      needs.set(color, need)
    }
  }

  return {
    library: size,
    lands,
    ramp,
    onTime,
    onTimeRamp,
    suggestedLands:
      formula && averageManaValue !== null ? Math.round(formula.base + formula.perManaValue * averageManaValue - 0.28 * ramp.cheap) : null,
    formula,
    colors: STAT_COLORS.flatMap((color) => (needs.has(color) ? [needs.get(color)!] : []))
  }
}
