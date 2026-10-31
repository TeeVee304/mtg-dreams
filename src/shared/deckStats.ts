import { CURVE_TOP, curveSlot, frontTypeWords } from './cards'
import type { CardInfo } from './types'

export { CURVE_TOP }

/** Colors counted in stats, WUBRG order. */
export const STAT_COLORS = ['W', 'U', 'B', 'R', 'G'] as const
/** One of {@link STAT_COLORS}. */
export type StatColor = (typeof STAT_COLORS)[number]

/**
 * What a spell's cost asks for: one color, several (`M`, multicolor), only generic mana (`generic`,
 * like `{2}`), or colorless mana from a colorless source (`C`, a `{C}` pip).
 */
export type CostKind = StatColor | 'M' | 'generic' | 'C'

/** Cost kinds in the order the curve stacks them, bottom up. */
export const COST_KINDS: CostKind[] = ['W', 'U', 'B', 'R', 'G', 'M', 'generic', 'C']

/** One copy of a spell on the curve: a dot. */
export interface CurveCard {
  name: string
  kind: CostKind
  /** The colors its cost asks for, WUBRG order; several for a multicolor spell. */
  colors: StatColor[]
}

/** Mana curve column. */
export interface CurveColumn {
  /** Mana value; {@link CURVE_TOP} means that or more. */
  manaValue: number
  /** Creature copies. */
  creatures: number
  /** Noncreature spell copies. */
  others: number
  /** Spell copies by what their cost asks for. */
  costs: Record<CostKind, number>
  /** Colored pips of its spells' costs, copies counted. */
  pips: Record<StatColor, number>
  /** Energy its spells make and spend, copies counted. */
  energy: { made: number; spent: number }
  /** Its spells, one entry a copy, in {@link COST_KINDS} order: the curve stacks them bottom up. */
  cards: CurveCard[]
}

/** @returns The colored pips of a mana cost: `{W/U}` counts for both, `{2/W}` and `{W/P}` for W. */
export function pipsOf(cost: string): Record<StatColor, number> {
  const pips: Record<StatColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const [, symbol] of cost.matchAll(/\{([^}]+)\}/g)) {
    for (const color of STAT_COLORS) if (symbol.split('/').includes(color)) pips[color]++
  }
  return pips
}

/** @returns The colors a spell's cost asks for; without a known cost, the card's colors. */
function costColors(info: CardInfo): StatColor[] {
  const cost = info.manaCost
  return cost === undefined ? STAT_COLORS.filter((color) => info.colors.includes(color)) : STAT_COLORS.filter((color) => pipsOf(cost)[color] > 0)
}

/** @returns What a spell's cost asks for ({@link CostKind}); without a known cost, its colors decide. */
export function costKind(info: CardInfo): CostKind {
  const colors = costColors(info)
  const cost = info.manaCost
  if (colors.length > 1) return 'M'
  if (colors.length === 1) return colors[0]
  return cost?.includes('{C}') ? 'C' : 'generic'
}

/** Stats panel data. Curve and color counts exclude lands. */
export interface DeckStats {
  /** Columns for mana values 0..{@link CURVE_TOP}. */
  curve: CurveColumn[]
  /** Spell copies per color; multicolored cards count toward each color. */
  colors: Record<StatColor, number>
  /** Colorless spell copies. */
  colorless: number
  /** Spell copies with two or more colors. */
  multicolor: number
  /** Spell (nonland) copies counted. */
  spells: number
  /** Land copies. */
  lands: number
  /** Average mana value of spells; null if none. */
  averageManaValue: number | null
  /** Copies excluded because card data is still loading. */
  pending: number
}

/** Input row of {@link deckStats}. */
export interface StatsRow {
  line: { qty: number; name?: string }
  /** Card data; undefined while loading, null if unknown to Scryfall (skipped). */
  info?: CardInfo | null
}

/** Computes curve, color and land counts; types are read from the front face. */
export function deckStats(rows: StatsRow[]): DeckStats {
  const curve: CurveColumn[] = Array.from({ length: CURVE_TOP + 1 }, (_, manaValue) => ({
    manaValue,
    creatures: 0,
    others: 0,
    costs: { W: 0, U: 0, B: 0, R: 0, G: 0, M: 0, generic: 0, C: 0 },
    pips: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    energy: { made: 0, spent: 0 },
    cards: []
  }))
  const colors: Record<StatColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  const stats: DeckStats = { curve, colors, colorless: 0, multicolor: 0, spells: 0, lands: 0, averageManaValue: null, pending: 0 }
  let totalManaValue = 0

  for (const { line, info } of rows) {
    if (info === undefined) {
      stats.pending += line.qty
      continue
    }
    if (!info) continue
    const slot = curveSlot(info)
    if (slot === null) {
      stats.lands += line.qty
      continue
    }

    const qty = line.qty
    stats.spells += qty
    totalManaValue += info.manaValue * qty
    const column = curve[slot]
    if (frontTypeWords(info.typeLine).includes('Creature')) column.creatures += qty
    else column.others += qty
    const kind = costKind(info)
    column.costs[kind] += qty
    const colorsAsked = costColors(info)
    for (let copy = 0; copy < qty; copy++) column.cards.push({ name: line.name ?? info.name, kind, colors: colorsAsked })
    const pips = pipsOf(info.manaCost ?? '')
    for (const color of STAT_COLORS) column.pips[color] += pips[color] * qty
    column.energy.made += (info.energy?.made ?? 0) * qty
    column.energy.spent += (info.energy?.spent ?? 0) * qty

    const cardColors = STAT_COLORS.filter((color) => info.colors.includes(color))
    for (const color of cardColors) colors[color] += qty
    if (cardColors.length === 0) stats.colorless += qty
    if (cardColors.length > 1) stats.multicolor += qty
  }

  const order = (card: CurveCard) => COST_KINDS.indexOf(card.kind)
  for (const column of curve) column.cards.sort((a, b) => order(a) - order(b) || a.colors.join().localeCompare(b.colors.join()))
  if (stats.spells > 0) stats.averageManaValue = totalManaValue / stats.spells
  return stats
}
