import { frontTypeWords } from './cards'
import type { CardInfo } from './types'

/** Last curve column; it aggregates this mana value and above. */
export const CURVE_TOP = 7

/** Colors counted in stats, WUBRG order. */
export const STAT_COLORS = ['W', 'U', 'B', 'R', 'G'] as const
/** One of {@link STAT_COLORS}. */
export type StatColor = (typeof STAT_COLORS)[number]

/** Mana curve column. */
export interface CurveColumn {
  /** Mana value; {@link CURVE_TOP} means that or more. */
  manaValue: number
  /** Creature copies. */
  creatures: number
  /** Noncreature spell copies. */
  others: number
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
  line: { qty: number }
  /** Card data; undefined while loading, null if unknown to Scryfall (skipped). */
  info?: CardInfo | null
}

/** Computes curve, color and land counts; types are read from the front face. */
export function deckStats(rows: StatsRow[]): DeckStats {
  const curve: CurveColumn[] = Array.from({ length: CURVE_TOP + 1 }, (_, manaValue) => ({ manaValue, creatures: 0, others: 0 }))
  const colors: Record<StatColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  const stats: DeckStats = { curve, colors, colorless: 0, multicolor: 0, spells: 0, lands: 0, averageManaValue: null, pending: 0 }
  let totalManaValue = 0

  for (const { line, info } of rows) {
    if (info === undefined) {
      stats.pending += line.qty
      continue
    }
    if (!info) continue
    const types = frontTypeWords(info.typeLine)
    if (types.includes('Land')) {
      stats.lands += line.qty
      continue
    }

    const qty = line.qty
    stats.spells += qty
    totalManaValue += info.manaValue * qty
    const column = curve[Math.min(CURVE_TOP, Math.max(0, Math.floor(info.manaValue)))]
    if (types.includes('Creature')) column.creatures += qty
    else column.others += qty

    const cardColors = STAT_COLORS.filter((color) => info.colors.includes(color))
    for (const color of cardColors) colors[color] += qty
    if (cardColors.length === 0) stats.colorless += qty
    if (cardColors.length > 1) stats.multicolor += qty
  }

  if (stats.spells > 0) stats.averageManaValue = totalManaValue / stats.spells
  return stats
}
