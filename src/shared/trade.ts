import { genericBasic } from './basics'
import { cardLines, countLines, nameKey, parseInventory } from './decklist'
import { safeFileName } from './filenames'
import type { InventoryItem, ListLine } from './types'

/**
 * Trade lists: snapshots of a player's haves and wants (no prices, decks or paths) exchanged as
 * files; matching runs locally.
 *
 * @packageDocumentation
 */

/** `format` marker of trade files. */
export const TRADE_FORMAT = 'mtg-dreams-trade'
/** Legacy format markers still accepted (pre-rename "MTG Dream"). */
const OLD_TRADE_FORMATS = ['mtg-dream-trade']
/** Trade file extension. */
export const TRADE_EXTENSION = 'mtgtrade'
/** Max entries read per card array of an imported file. */
const MAX_CARDS = 20_000

/** Card name and quantity. */
export interface TradeCard {
  name: string
  qty: number
}

/** Trade file contents (JSON). */
export interface TradeSnapshot {
  format: typeof TRADE_FORMAT
  version: 1
  /** Player name. */
  name: string
  /** ISO timestamp of creation. */
  createdAt: string
  /** Owned cards. */
  haves: TradeCard[]
  /** Cards needed by wishlists. */
  wants: TradeCard[]
  /** `list`: imported from a plain list or CSV, not produced by MTG Dreams. */
  source: 'app' | 'list'
}

/** Own want with its source wishlists. */
export interface Want extends TradeCard {
  /** Wishlists needing the card; empty for a friend's wants. */
  lists: string[]
}

const byName = (a: TradeCard, b: TradeCard) => a.name.localeCompare(b.name)

/** Excludes the five regular basics. */
const tradable = (name: string) => !genericBasic(name)

/**
 * @param inventory - Items by nameKey.
 * @returns Wants sorted by name; each card's qty is its largest shortfall on any single wishlist
 * (owned copies count toward every list).
 */
export function computeWants(
  wishlists: Array<{ name: string; lines: ListLine[] }>,
  inventory: Map<string, InventoryItem>
): Want[] {
  const wants = new Map<string, Want>()
  for (const list of wishlists) {
    const wanted = new Map<string, TradeCard>()
    for (const line of cardLines(list.lines)) {
      if (!tradable(line.name)) continue
      const key = nameKey(line.name)
      const card = wanted.get(key)
      if (card) card.qty += line.qty
      else wanted.set(key, { name: line.name, qty: line.qty })
    }
    for (const [key, card] of wanted) {
      const missing = card.qty - (inventory.get(key)?.qty ?? 0)
      if (missing <= 0) continue
      const want = wants.get(key)
      if (want) {
        want.qty = Math.max(want.qty, missing)
        want.lists.push(list.name)
      } else {
        wants.set(key, { name: card.name, qty: missing, lists: [list.name] })
      }
    }
  }
  return [...wants.values()].sort(byName)
}

/** @returns Own haves (all owned cards except regular basics) and wants, sorted by name. */
export function myTradeSide(
  inventory: Map<string, InventoryItem>,
  wishlists: Array<{ name: string; lines: ListLine[] }>
): { haves: TradeCard[]; wants: Want[] } {
  const haves = [...inventory.values()]
    .filter((item) => item.qty > 0 && tradable(item.name))
    .map(({ name, qty }) => ({ name, qty }))
    .sort(byName)
  return { haves, wants: computeWants(wishlists, inventory) }
}

/** @returns Shareable snapshot; wants omit wishlist names. */
export function buildSnapshot(
  name: string,
  inventory: Map<string, InventoryItem>,
  wishlists: Array<{ name: string; lines: ListLine[] }>,
  now = new Date()
): TradeSnapshot {
  const { haves, wants } = myTradeSide(inventory, wishlists)
  return {
    format: TRADE_FORMAT,
    version: 1,
    name: name.trim(),
    createdAt: now.toISOString(),
    haves,
    wants: wants.map(({ name: card, qty }) => ({ name: card, qty })),
    source: 'app'
  }
}

/** @returns Pretty-printed JSON, newline-terminated. */
export function serializeSnapshot(snapshot: TradeSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

/** @returns Plain-text form with `// Have` and `// Want` sections, re-importable by {@link parseTradeText}. */
export function snapshotToText(snapshot: TradeSnapshot): string {
  return [
    `// MTG Dreams trade list: ${snapshot.name} (${snapshot.createdAt.slice(0, 10)})`,
    '// Have',
    ...countLines(snapshot.haves),
    '',
    '// Want',
    ...countLines(snapshot.wants),
    ''
  ].join('\n')
}

/** @returns Sanitized file name for a friend's trade list, or `fallback` if empty. */
export function tradeName(name: string, fallback = 'Friend'): string {
  return safeFileName(name) || fallback
}

/** Validates untrusted card entries: trims names (max 200 chars), drops invalid quantities, merges by nameKey, sorts. */
function cleanCards(value: unknown): TradeCard[] {
  if (!Array.isArray(value)) return []
  const cards = new Map<string, TradeCard>()
  for (const item of value.slice(0, MAX_CARDS)) {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 200) : ''
    const qty = Number(item?.qty)
    if (!name || !Number.isSafeInteger(qty) || qty <= 0) continue
    const key = nameKey(name)
    const card = cards.get(key)
    if (card) card.qty += qty
    else cards.set(key, { name, qty })
  }
  return [...cards.values()].sort(byName)
}

/** Splits a CSV line; supports quoted cells and `""` escapes. */
function splitCsv(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells
}

/** Parses a collection CSV (Moxfield, Deckbox) with count and name columns; null if not such a CSV. */
function parseCsvCards(text: string): TradeCard[] | null {
  const rows = text.split(/\r?\n/).filter((row) => row.trim())
  if (rows.length < 2) return null
  const header = splitCsv(rows[0]).map((cell) => cell.trim().toLowerCase())
  const countCol = header.findIndex((cell) => ['count', 'quantity', 'qty'].includes(cell))
  const nameCol = header.findIndex((cell) => ['name', 'card name', 'card'].includes(cell))
  if (countCol < 0 || nameCol < 0) return null
  return cleanCards(
    rows.slice(1).map((row) => {
      const cells = splitCsv(row)
      return { name: cells[nameCol], qty: Number.parseInt(cells[countCol], 10) }
    })
  )
}

/** Parses card lines into merged, sorted trade cards. */
const listCards = (lines: string[]) =>
  [...parseInventory(lines.join('\n')).values()].map(({ name, qty }) => ({ name, qty })).sort(byName)

/**
 * Parses a friend's trade list: JSON trade file, its text form, a collection CSV, or a plain card
 * list (lines outside a `// Want` section are haves).
 * @param fallbackName - Name used when the input carries none.
 * @throws Error with a user-facing message if the input is invalid or has no cards.
 */
export function parseTradeText(text: string, fallbackName: string, now = new Date()): TradeSnapshot {
  const trimmed = text.replace(/^﻿/, '').trim()
  const base = { format: TRADE_FORMAT, version: 1 } as const

  if (trimmed.startsWith('{')) {
    let data: any
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new Error('This file is not a valid trade list.')
    }
    if (data?.format !== TRADE_FORMAT && !OLD_TRADE_FORMATS.includes(data?.format)) throw new Error('This file is not an MTG Dreams trade list.')
    const date = typeof data.createdAt === 'string' && !Number.isNaN(Date.parse(data.createdAt)) ? data.createdAt : now.toISOString()
    return {
      ...base,
      name: tradeName(typeof data.name === 'string' ? data.name : '', fallbackName),
      createdAt: date,
      haves: cleanCards(data.haves),
      wants: cleanCards(data.wants),
      source: data.source === 'list' ? 'list' : 'app'
    }
  }

  const csv = parseCsvCards(trimmed)
  if (csv) {
    if (csv.length === 0) throw new Error('No cards found in this file.')
    return { ...base, name: tradeName(fallbackName), createdAt: now.toISOString(), haves: csv, wants: [], source: 'list' }
  }

  const sections = { haves: [] as string[], wants: [] as string[] }
  let section: keyof typeof sections = 'haves'
  for (const row of trimmed.split(/\r?\n/)) {
    const marker = /^\/\/\s*(haves?|wants?)\s*:?\s*$/i.exec(row.trim())
    if (marker) section = marker[1].toLowerCase().startsWith('want') ? 'wants' : 'haves'
    else sections[section].push(row)
  }
  const haves = listCards(sections.haves)
  const wants = listCards(sections.wants)
  if (haves.length + wants.length === 0) {
    throw new Error('No cards found. Use one card per line, like “4 Lightning Bolt”.')
  }
  const header = /^\/\/\s*MTG Dreams? trade list:\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/im.exec(trimmed)
  return {
    ...base,
    name: tradeName(header?.[1] ?? '', tradeName(fallbackName)),
    createdAt: header ? new Date(`${header[2]}T12:00:00Z`).toISOString() : now.toISOString(),
    haves,
    wants,
    source: header ? 'app' : 'list'
  }
}

/** Matched card between two trade sides. */
export interface TradeMatch {
  name: string
  /** Tradable copies: min of `available` and `needed`. */
  qty: number
  /** Giver's copies. */
  available: number
  /** Receiver's need. */
  needed: number
  /** Own wishlists wanting it; empty for cards going to the friend. */
  lists: string[]
}

/** @returns `forMe`: friend's haves matching own wants. `forThem`: own haves matching friend's wants. */
export function matchTrades(
  myHaves: TradeCard[],
  myWants: Want[],
  friend: Pick<TradeSnapshot, 'haves' | 'wants'>
): { forMe: TradeMatch[]; forThem: TradeMatch[] } {
  const index = (cards: TradeCard[]) => new Map(cards.map((card) => [nameKey(card.name), card]))
  const theirHaves = index(friend.haves)
  const mine = index(myHaves)
  const forMe: TradeMatch[] = []
  for (const want of myWants) {
    const have = theirHaves.get(nameKey(want.name))
    if (have) forMe.push({ name: want.name, qty: Math.min(have.qty, want.qty), available: have.qty, needed: want.qty, lists: want.lists })
  }
  const forThem: TradeMatch[] = []
  for (const want of friend.wants) {
    const have = mine.get(nameKey(want.name))
    if (have && tradable(have.name)) {
      forThem.push({ name: have.name, qty: Math.min(have.qty, want.qty), available: have.qty, needed: want.qty, lists: [] })
    }
  }
  return { forMe, forThem }
}
