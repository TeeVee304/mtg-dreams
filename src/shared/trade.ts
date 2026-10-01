import { genericBasic } from './basics'
import { cardLines, countLines, nameKey, parseInventory } from './decklist'
import { safeFileName } from './filenames'
import type { InventoryItem, ListLine } from './types'

// Trading between two players works by exchanging small trade files: each holds
// the cards a player owns and what their wishlists still need, and nothing else
// (no prices, decks or file paths). Matching happens locally on each side.

export const TRADE_FORMAT = 'mtg-dreams-trade'
// Trade files made before the app was renamed (from MTG Dream) are still read.
const OLD_TRADE_FORMATS = ['mtg-dream-trade']
export const TRADE_EXTENSION = 'mtgtrade'
const MAX_CARDS = 20_000

export interface TradeCard {
  name: string
  qty: number
}

export interface TradeSnapshot {
  format: typeof TRADE_FORMAT
  version: 1
  /** The player's name, chosen when sharing (or when importing a plain list). */
  name: string
  /** When the list was made (ISO date). */
  createdAt: string
  haves: TradeCard[]
  wants: TradeCard[]
  /** 'list' when imported from a plain card list: the friend may not use MTG Dreams. */
  source: 'app' | 'list'
}

export interface Want extends TradeCard {
  /** Your wishlists that need the card (only known for your own wants). */
  lists: string[]
}

const byName = (a: TradeCard, b: TradeCard) => a.name.localeCompare(b.name)

// The five regular basic lands are never worth trading.
const tradable = (name: string) => !genericBasic(name)

/**
 * What your wishlists still need. One owned copy counts for every list, so the
 * need for a card is its largest shortfall on any single wishlist.
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

/** Your side of any trade: every card you own (basic lands aside), and what your wishlists still need. */
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

/** Your trade list, as shared with friends: your side of the trade, without which wishlists want what. */
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

export function serializeSnapshot(snapshot: TradeSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

/** A chat-friendly version, readable by people and by MTG Dreams. */
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

/** A friend's name as used for their saved file. */
export function tradeName(name: string, fallback = 'Friend'): string {
  return safeFileName(name) || fallback
}

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

/** Splits one CSV line, honouring quotes ("a, b" and doubled "" inside quotes). */
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

/** Collection CSVs such as Moxfield's or Deckbox's (a "Count" and a "Name" column). */
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

const listCards = (lines: string[]) =>
  [...parseInventory(lines.join('\n')).values()].map(({ name, qty }) => ({ name, qty })).sort(byName)

/**
 * Reads a friend's trade list: an MTG Dreams trade file, its text version ("// Have"
 * and "// Want" sections), a collection CSV, or any plain card list, which counts
 * as cards they have. `fallbackName` names lists that don't carry a name.
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
      // Saved imports of plain lists keep saying so.
      source: data.source === 'list' ? 'list' : 'app'
    }
  }

  const csv = parseCsvCards(trimmed)
  if (csv) {
    if (csv.length === 0) throw new Error('No cards found in this file.')
    return { ...base, name: tradeName(fallbackName), createdAt: now.toISOString(), haves: csv, wants: [], source: 'list' }
  }

  // Plain text, optionally with "// Have" / "// Want" sections; anything else counts as haves.
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

export interface TradeMatch {
  name: string
  /** Copies worth trading: what the giver has, up to what the receiver needs. */
  qty: number
  available: number
  needed: number
  /** Your wishlists that want it (cards coming to you). */
  lists: string[]
}

/** Cards the friend has that you want, and cards you have that they want. */
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
