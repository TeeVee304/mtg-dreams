import type { AppSettings, PriceBaseline } from '@shared/api'
import { COLOR_LETTERS, type ColorFilter } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { STAT_COLORS } from '@shared/deckStats'
import { nameKey } from '@shared/decklist'
import { deckSizeCheck, isBackground, listCommanders, listFormat } from '@shared/formats'
import { sumOf } from '@shared/totals'
import type { InventoryItem, Printing } from '@shared/types'
import type { CardList } from '../stores/library'
import { priceChange } from '../stores/history'
import { preferredGroup } from '../stores/setGroups'
import { artCrop } from './artwork'
import { listRows, summarize, type Row } from './summary'

/**
 * @returns A list's figures for the sidebar and the Most Wanted shelf: totals, deck size, price
 * changes, color identity and the art that stands for it.
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
  // Wishlist cards still needed whose price moved past the alert threshold since they were added.
  const changes =
    list.kind === 'wishlist'
      ? rows.flatMap((row) => {
          if (row.bundledIds) return []
          const change = priceChange(row.line, row.unit, row.owned, settings, baselines, preferredGroup(list)?.name, settings)
          return change ? [change.direction] : []
        })
      : []
  const commanders = format?.commander ? listCommanders(list.lines) : []
  return {
    format,
    summary: summarize(rows),
    mainCards,
    size: list.kind === 'deck' && format ? deckSizeCheck(format, mainCards) : null,
    /** Still-needed wishlist cards cheaper than when added. */
    cheaper: changes.filter((direction) => direction === 'down').length,
    /** Still-needed wishlist cards pricier than when added. */
    pricier: changes.filter((direction) => direction === 'up').length,
    colors: listColors(rows, commanders),
    art: artCrop(listPrinting(rows, commanders[0] ?? null))
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
 * @param commanders - Commander names in commander formats; their color identity decides alone.
 * @returns Color identity in WUBRG order: the commanders', else the union of the cards'. `C` when that
 * identity is empty: colorless commanders, or a list whose cards are all colorless (once all have loaded).
 */
export function listColors(
  rows: Array<{ line: { name: string }; info?: { colorIdentity: string[] } | null }>,
  commanders: string[]
): ColorFilter[] {
  if (commanders.length > 0) {
    const keys = commanders.map(nameKey)
    const infos = keys.map((key) => rows.find((row) => nameKey(row.line.name) === key)?.info)
    if (infos.some((info) => !info)) return []
    const identity = new Set(infos.flatMap((info) => info!.colorIdentity))
    return identity.size === 0 ? ['C'] : STAT_COLORS.filter((color) => identity.has(color))
  }
  const identity = new Set(rows.flatMap((row) => row.info?.colorIdentity ?? []))
  if (identity.size > 0) return STAT_COLORS.filter((color) => identity.has(color))
  const loaded = rows.length > 0 && rows.every((row) => row.info !== undefined) && rows.some((row) => row.info)
  return loaded ? ['C'] : []
}

/** A commander's Background, as a list header pictures it: a badge by the commander's portrait. */
export interface HeaderBackground {
  name: string
  /** Its art crop; null without card images, or until it loads. */
  art: string | null
  /** Its color, ringing the badge. */
  color: ColorFilter
}

/** @returns Whether a row is a Background, which joins a commander. */
const isBackgroundRow = (row: Row) => !!row.info && isBackground(row.info)

/**
 * @param leaderRows - A list's commander rows, as listed.
 * @param cardImages - Card images are shown (Settings).
 * @returns How a list header pictures its commanders: the commander first, then its partner or
 * Background (`rows`, `names` as shown); the art of those with a portrait (one, or both partners';
 * none until all load, so a pair never shows half); a Background apart, as a badge.
 */
export function headerLeaders(leaderRows: Row[], cardImages: boolean) {
  const rows = [...leaderRows].sort((a, b) => Number(isBackgroundRow(a)) - Number(isBackgroundRow(b)))
  const backgroundRow = rows.length > 1 ? (rows.find(isBackgroundRow) ?? null) : null
  const portraits = rows.filter((row) => row !== backgroundRow)
  const crops = cardImages ? portraits.flatMap((row) => artCrop(row.resolution?.printing) ?? []) : []
  const firstColor = backgroundRow?.info?.colorIdentity.find((color): color is ColorFilter => COLOR_LETTERS.includes(color as ColorFilter))
  const background: HeaderBackground | null = backgroundRow && {
    name: backgroundRow.flavorName ?? backgroundRow.line.name,
    art: cardImages ? artCrop(backgroundRow.resolution?.printing) : null,
    color: firstColor ?? 'C'
  }
  return {
    rows,
    names: rows.map((row) => row.flavorName ?? row.line.name),
    arts: crops.length === portraits.length ? crops : [],
    background
  }
}
