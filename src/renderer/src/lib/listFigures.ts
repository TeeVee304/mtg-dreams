import type { AppSettings, PriceBaseline } from '@shared/api'
import type { ColorFilter } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { STAT_COLORS } from '@shared/deckStats'
import { nameKey } from '@shared/decklist'
import { deckSizeCheck, listCommander, listFormat } from '@shared/formats'
import { sumOf } from '@shared/totals'
import type { InventoryItem, Printing } from '@shared/types'
import type { CardList } from '../stores/library'
import { priceDrop } from '../stores/history'
import { artCrop } from './artwork'
import { listRows, summarize, type Row } from './summary'

/**
 * @returns A list's figures for the sidebar and the Most Wanted shelf: totals, deck size, price
 * drops, color identity and the art that stands for it.
 */
export function listFigures(
  list: CardList,
  inventory: Map<string, InventoryItem>,
  settings: AppSettings,
  baselines: Record<string, PriceBaseline>,
  pool: CopyPool
) {
  const format = listFormat(list.lines)
  const rows = listRows(list, inventory, settings, pool)
  const mainCards = sumOf(rows, (row) => (row.side ? 0 : row.line.qty))
  const cheaper =
    list.kind === 'wishlist'
      ? rows.filter(
          (row) =>
            !row.bundledIds &&
            priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)
        ).length
      : 0
  const commander = format?.commander ? listCommander(list.lines) : null
  return {
    format,
    summary: summarize(rows),
    mainCards,
    size: list.kind === 'deck' && format ? deckSizeCheck(format, mainCards) : null,
    cheaper,
    colors: listColors(rows, commander),
    art: artCrop(listPrinting(rows, commander))
  }
}

/** Figures of one list ({@link listFigures}). */
export type ListFigures = ReturnType<typeof listFigures>

/**
 * @returns The printing that pictures a list: its commander's, else its priciest card's; null until
 * one has loaded.
 */
function listPrinting(rows: Row[], commander: string | null): Printing | null {
  if (commander) {
    const leader = rows.find((row) => nameKey(row.line.name) === nameKey(commander))?.resolution?.printing
    if (leader?.imageNormal) return leader
  }
  let best: Row | null = null
  for (const row of rows) {
    if (row.bundledIds || !row.resolution?.printing?.imageNormal) continue
    if (!best || (row.unit ?? 0) > (best.unit ?? 0)) best = row
  }
  return best?.resolution?.printing ?? null
}

/**
 * @param rows - List rows, with card data once loaded.
 * @param commander - Commander name in commander formats; its color identity decides alone.
 * @returns Color identity in WUBRG order: the commander's, else the union of the cards'. `C` when that
 * identity is empty: a colorless commander, or a list whose cards are all colorless (once all have loaded).
 */
function listColors(rows: Array<{ line: { name: string }; info?: { colorIdentity: string[] } | null }>, commander: string | null): ColorFilter[] {
  if (commander) {
    const info = rows.find((row) => nameKey(row.line.name) === nameKey(commander))?.info
    if (!info) return []
    return info.colorIdentity.length === 0 ? ['C'] : STAT_COLORS.filter((color) => info.colorIdentity.includes(color))
  }
  const identity = new Set(rows.flatMap((row) => row.info?.colorIdentity ?? []))
  if (identity.size > 0) return STAT_COLORS.filter((color) => identity.has(color))
  const loaded = rows.length > 0 && rows.every((row) => row.info !== undefined) && rows.some((row) => row.info)
  return loaded ? ['C'] : []
}
