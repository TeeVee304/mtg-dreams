import { itemFromCopies } from './inventory'
import type { CardLine, InventoryItem, ListLine, OwnedCopy } from './types'

let idCounter = 0

export function newLineId(): string {
  idCounter += 1
  return `l${idCounter}`
}

/**
 * Key used to match cards by name across lists and the inventory:
 * case-insensitive, whitespace-collapsed, front face only
 * ("Delver of Secrets // Insectile Aberration" matches "Delver of Secrets").
 */
export function nameKey(name: string): string {
  return name.split('//')[0].replace(/\s+/g, ' ').trim().toLowerCase()
}

const LINE_RE = /^(\d+)\s*[xX]?\s+(.+)$/
const FOIL_RE = /\s*(?:\(F\)|\*F\*)$/i
const GOLDFISH_SET_RE = /\s*\[([A-Za-z0-9]{2,8})\]$/
const GOLDFISH_TAG_RE = /\s*<([^<>]+)>$/
// Arena / Moxfield export style: "Lightning Bolt (2XM) 141"
const ARENA_SET_RE = /\s+\(([A-Za-z0-9]{2,8})\)(?:\s+(\S+))?$/

/** Parses one "N Card Name" line. Returns null if the line isn't a card line. */
export function parseCardLine(line: string): Omit<CardLine, 'id' | 'kind'> | null {
  const match = LINE_RE.exec(line.trim())
  if (!match) return null
  const qty = Number.parseInt(match[1], 10)
  if (!Number.isSafeInteger(qty) || qty <= 0) return null

  let rest = match[2].trim()
  let foil = false
  let set: string | undefined
  let collector: string | undefined

  // Suffix tokens may come in any order, so peel them off until none match.
  for (;;) {
    let m: RegExpExecArray | null
    if ((m = FOIL_RE.exec(rest))) {
      foil = true
    } else if (!set && (m = GOLDFISH_SET_RE.exec(rest))) {
      set = m[1].toLowerCase()
    } else if (!collector && (m = GOLDFISH_TAG_RE.exec(rest))) {
      collector = m[1].trim()
    } else if (!set && (m = ARENA_SET_RE.exec(rest))) {
      set = m[1].toLowerCase()
      collector ??= m[2]
    } else {
      break
    }
    rest = rest.slice(0, m.index)
  }

  const name = rest.replace(/\s+/g, ' ').trim()
  if (!name) return null
  return { qty, name, set, collector: collector || undefined, foil }
}

export function parseList(text: string): ListLine[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/)
  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop()
  return rows.map((row): ListLine => {
    const card = parseCardLine(row)
    if (card) return { kind: 'card', id: newLineId(), ...card }
    return { kind: 'text', id: newLineId(), text: row.trimEnd() }
  })
}

export function serializeCard(card: Omit<CardLine, 'id' | 'kind'>): string {
  let line = `${card.qty} ${card.name}`
  if (card.collector) line += ` <${card.collector}>`
  if (card.set) line += ` [${card.set.toUpperCase()}]`
  if (card.foil) line += ' (F)'
  return line
}

export function serializeList(lines: ListLine[]): string {
  const out = lines.map((line) => (line.kind === 'card' ? serializeCard(line) : line.text))
  return out.length ? `${out.join('\n')}\n` : ''
}

export function cardLines(lines: ListLine[]): CardLine[] {
  return lines.filter((line): line is CardLine => line.kind === 'card')
}

const SECTION_HEADERS = new Set([
  'deck', 'main', 'mainboard', 'maindeck', 'sideboard', 'side', 'commander', 'companion', 'maybeboard', 'about'
])

/** Non-blank text lines that aren't comments or known section headers — likely typos. */
export function unrecognizedLines(lines: ListLine[]): string[] {
  return lines
    .filter((line): line is Extract<ListLine, { kind: 'text' }> => line.kind === 'text')
    .map((line) => line.text.trim())
    .filter((text) => {
      if (!text || text.startsWith('//') || text.startsWith('#')) return false
      return !SECTION_HEADERS.has(text.toLowerCase().replace(/:$/, ''))
    })
}

export interface Allocation {
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card wanted by earlier lines of the list (they get inventory first). */
  before: number
}

/**
 * Splits owned copies across the lines of one list. The same card can appear
 * on several lines (different versions); each owned copy is only counted once.
 * Different lists all share the full inventory.
 */
export function allocateOwned(lines: CardLine[], inventory: Map<string, InventoryItem>): Allocation[] {
  const wantedSoFar = new Map<string, number>()
  return lines.map((line) => {
    const key = nameKey(line.name)
    const before = wantedSoFar.get(key) ?? 0
    wantedSoFar.set(key, before + line.qty)
    const available = Math.max(0, (inventory.get(key)?.qty ?? 0) - before)
    return { owned: Math.min(line.qty, available), before }
  })
}

/**
 * The inventory, by card name: lines of the same card (any versions and finishes)
 * make one item, which keeps its copies by version.
 */
export function parseInventory(text: string): Map<string, InventoryItem> {
  const cards = new Map<string, { name: string; copies: OwnedCopy[] }>()
  for (const card of cardLines(parseList(text))) {
    const key = nameKey(card.name)
    const copy: OwnedCopy = { qty: card.qty, set: card.set, collector: card.collector, foil: card.foil }
    const existing = cards.get(key)
    if (existing) existing.copies.push(copy)
    else cards.set(key, { name: card.name, copies: [copy] })
  }
  const items = new Map<string, InventoryItem>()
  for (const [key, { name, copies }] of cards) {
    const item = itemFromCopies(name, copies)
    if (item) items.set(key, item)
  }
  return items
}

/** One line per version of each card, cards by name. */
export function serializeInventory(items: Map<string, InventoryItem>): string {
  const sorted = [...items.values()]
    .filter((item) => item.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  return sorted
    .flatMap((item) => item.copies.map((copy) => `${serializeCard({ ...copy, name: item.name })}\n`))
    .join('')
}

/** Plain "N Card Name" lines, as the inventory and trade lists write cards. */
export function countLines(cards: Array<{ qty: number; name: string }>): string[] {
  return cards.map((card) => `${card.qty} ${card.name}`)
}
