import { frontTypeWords } from './cards'
import type { CardInfo } from './types'

// The numbers behind a deck's or wishlist's Stats panel: its mana curve and colors.
// Lands are left out of both, as deck builders count them separately.

/** The highest mana value with its own column; anything above joins it ("7+"). */
export const CURVE_TOP = 7

export const STAT_COLORS = ['W', 'U', 'B', 'R', 'G'] as const
export type StatColor = (typeof STAT_COLORS)[number]

export interface CurveColumn {
  /** Mana value; CURVE_TOP means that or more. */
  manaValue: number
  creatures: number
  others: number
}

export interface DeckStats {
  /** One column per mana value, 0 to CURVE_TOP+. */
  curve: CurveColumn[]
  /** Non-land cards of each color; a multicolored card counts toward each of its colors. */
  colors: Record<StatColor, number>
  colorless: number
  multicolor: number
  /** Non-land cards counted. */
  spells: number
  /** Their average mana value, or null without any. */
  averageManaValue: number | null
  /** Cards whose data hasn't loaded yet, so they're not counted. */
  pending: number
}

export interface StatsRow {
  line: { qty: number }
  /** Card data; undefined while loading, null for a card Scryfall doesn't know. */
  info?: CardInfo | null
}

export function deckStats(rows: StatsRow[]): DeckStats {
  const curve: CurveColumn[] = Array.from({ length: CURVE_TOP + 1 }, (_, manaValue) => ({ manaValue, creatures: 0, others: 0 }))
  const colors: Record<StatColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  const stats: DeckStats = { curve, colors, colorless: 0, multicolor: 0, spells: 0, averageManaValue: null, pending: 0 }
  let totalManaValue = 0

  for (const { line, info } of rows) {
    if (info === undefined) {
      stats.pending += line.qty
      continue
    }
    if (!info) continue
    const types = frontTypeWords(info.typeLine)
    if (types.includes('Land')) continue

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
