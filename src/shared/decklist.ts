import { itemFromCopies } from './inventory'
import type { CardLine, InventoryItem, ListLine, OwnedCopy } from './types'

/** Source of {@link newLineId}. */
let idCounter = 0

/** @returns Session-unique line id. */
export function newLineId(): string {
  idCounter += 1
  return `l${idCounter}`
}

/** Card identity key: front face only, whitespace-collapsed, lower-case. */
export function nameKey(name: string): string {
  return name.split('//')[0].replace(/\s+/g, ' ').trim().toLowerCase()
}

/** `N[x] rest` card line. */
const LINE_RE = /^(\d+)\s*[xX]?\s+(.+)$/
/** Foil suffix: `(F)` or `*F*`. */
const FOIL_RE = /\s*(?:\(F\)|\*F\*)$/i
/** Goldfish set suffix: `[SET]`. */
const GOLDFISH_SET_RE = /\s*\[([A-Za-z0-9]{2,8})\]$/
/** Goldfish tag suffix: `<tag>`. */
const GOLDFISH_TAG_RE = /\s*<([^<>]+)>$/
/** Arena/Moxfield suffix: `Lightning Bolt (2XM) 141`. */
const ARENA_SET_RE = /\s+\(([A-Za-z0-9]{2,8})\)(?:\s+(\S+))?$/

/**
 * Parses `N[x] Name` with optional suffixes in any order: `<tag>`, `[SET]`, `(F)`/`*F*`, `(SET) num`.
 * @returns Card fields; null if not a card line.
 */
export function parseCardLine(line: string): Omit<CardLine, 'id' | 'kind'> | null {
  const match = LINE_RE.exec(line.trim())
  if (!match) return null
  const qty = Number.parseInt(match[1], 10)
  if (!Number.isSafeInteger(qty) || qty <= 0) return null

  let rest = match[2].trim()
  let foil = false
  let set: string | undefined
  let collector: string | undefined

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

/** Parses a list file (BOM-tolerant, trailing blank lines dropped); non-card lines become {@link TextLine}s. */
export function parseList(text: string): ListLine[] {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/)
  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop()
  return rows.map((row): ListLine => {
    const card = parseCardLine(row)
    if (card) return { kind: 'card', id: newLineId(), ...card }
    return { kind: 'text', id: newLineId(), text: row.trimEnd() }
  })
}

/** @returns Canonical line: `N Name <collector> [SET] (F)`. */
export function serializeCard(card: Omit<CardLine, 'id' | 'kind'>): string {
  let line = `${card.qty} ${card.name}`
  if (card.collector) line += ` <${card.collector}>`
  if (card.set) line += ` [${card.set.toUpperCase()}]`
  if (card.foil) line += ' (F)'
  return line
}

/** @returns File text, newline-terminated; `''` for no lines. */
export function serializeList(lines: ListLine[]): string {
  const out = lines.map((line) => (line.kind === 'card' ? serializeCard(line) : line.text))
  return out.length ? `${out.join('\n')}\n` : ''
}

/** @returns Card lines only. */
export function cardLines(lines: ListLine[]): CardLine[] {
  return lines.filter((line): line is CardLine => line.kind === 'card')
}

/** Known section header words (Arena, Moxfield, Goldfish), lower-case, without trailing colon. */
const SECTION_HEADERS = new Set([
  'deck', 'main', 'mainboard', 'maindeck', 'sideboard', 'side', 'commander', 'companion', 'maybeboard', 'about'
])

/** @returns Trimmed text lines that are not blank, `//`/`#` comments or section headers (likely typos). */
export function unrecognizedLines(lines: ListLine[]): string[] {
  return lines
    .filter((line): line is Extract<ListLine, { kind: 'text' }> => line.kind === 'text')
    .map((line) => line.text.trim())
    .filter((text) => {
      if (!text || text.startsWith('//') || text.startsWith('#')) return false
      return !SECTION_HEADERS.has(text.toLowerCase().replace(/:$/, ''))
    })
}

/** Inventory coverage of one list line. */
export interface Allocation {
  /** Copies of this line covered by the inventory. */
  owned: number
  /** Copies of the same card claimed by earlier lines, which take precedence. */
  before: number
}

/**
 * Allocates owned copies to the lines of one list in order, counting each copy once per list.
 * Each list is allocated against the full inventory independently.
 * @param inventory - Items by nameKey.
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

/** @returns Inventory items by nameKey; lines of the same card merge into one item's copies. */
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

/** @returns Inventory file text: one line per copy group, sorted by name; empty items omitted. */
export function serializeInventory(items: Map<string, InventoryItem>): string {
  const sorted = [...items.values()]
    .filter((item) => item.qty > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  return sorted
    .flatMap((item) => item.copies.map((copy) => `${serializeCard({ ...copy, name: item.name })}\n`))
    .join('')
}

/** @returns Plain `N Name` lines. */
export function countLines(cards: Array<{ qty: number; name: string }>): string[] {
  return cards.map((card) => `${card.qty} ${card.name}`)
}
