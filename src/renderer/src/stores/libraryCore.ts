import type { ListFile, LoadedData } from '@shared/api'
import { nameKey, parseInventory, parseList, serializeInventory, serializeList } from '@shared/decklist'
import { listFormat } from '@shared/formats'
import { addCopies, itemFromCopies, withTotal, type Version } from '@shared/inventory'
import { sameDeckName, upgradeOf, upgradeVariant, withUpgradeOf } from '@shared/listUpgrade'
import { sameVersion, variantFor, type ListVersion } from '@shared/listVersion'
import { addToBoard, type BoardEntry } from '@shared/sideboard'
import { parseTradeText, tradeName, type TradeSnapshot } from '@shared/trade'
import type { CardLine, InventoryItem, ListKind, ListLine, OwnedCopy } from '@shared/types'

/**
 * The library's pure core: its state and how edits, reloads and undo change it. No React and no
 * I/O, so all of it runs in unit tests; {@link LibraryStore} applies it and writes the files.
 *
 * @packageDocumentation
 */

/** What each kind of list is called in labels. */
export const KIND_NOUN: Record<ListKind, string> = { deck: 'deck', wishlist: 'wishlist', brew: 'brew' }

/** Deck, wishlist or brew backed by one text file. */
export interface CardList {
  kind: ListKind
  name: string
  lines: ListLine[]
  /** Normalized file text, compared to detect changes. */
  text: string
}

/** List identity; names are unique per kind only. */
export interface ListRef {
  kind: ListKind
  name: string
}

/** List identity equality. */
export const sameList = (a: ListRef, b: ListRef) => a.kind === b.kind && a.name === b.name

/** Library state. */
export interface LibraryState {
  status: 'loading' | 'ready' | 'error'
  /** Initial load error. */
  error?: string
  dataDir: string
  lists: CardList[]
  /** Inventory by nameKey. */
  inventory: Map<string, InventoryItem>
  /** Friends' trade lists; `name` equals the file name. */
  trades: TradeSnapshot[]
}

/** State before the first load. */
export const LOADING: LibraryState = { status: 'loading', dataDir: '', lists: [], inventory: new Map(), trades: [] }

/** Card line fields for additions. */
export type NewCard = Omit<CardLine, 'id' | 'kind'>

/** Edit target: a list or the inventory. */
export type ChangeTarget = { type: 'list'; list: ListRef } | { type: 'inventory' }

/** Target equality. */
export const sameTarget = (a: ChangeTarget, b: ChangeTarget) =>
  a.type === 'inventory' ? b.type === 'inventory' : b.type === 'list' && sameList(a.list, b.list)

/** Save rejected with `CONFLICT_ERROR` (file changed externally). */
export interface Conflict {
  target: ChangeTarget
  /** Display name: quoted list name or `Your inventory`. */
  name: string
}

/** @returns The conflict shown when a save of `target` is rejected. */
export const conflictOn = (target: ChangeTarget): Conflict => ({
  target,
  name: target.type === 'list' ? `“${target.list.name}”` : 'Your inventory'
})

/** Undo history metadata for an edit. */
export interface Change {
  /** Undo label. */
  label: string
  /** Offer Undo in a toast; never merged with adjacent edits. */
  announce?: boolean
}

/** Undo outcome message. */
export interface UndoResult {
  message: string
  kind: 'info' | 'error'
}

/** Serialized text per inventory map; a committed map is replaced on change, never modified. */
const inventoryTexts = new WeakMap<Map<string, InventoryItem>, string>()

/** @returns {@link serializeInventory} of `inventory`, computed once per map. */
export function inventoryText(inventory: Map<string, InventoryItem>): string {
  let text = inventoryTexts.get(inventory)
  if (text === undefined) {
    text = serializeInventory(inventory)
    inventoryTexts.set(inventory, text)
  }
  return text
}

/** Case-insensitive name comparator. */
export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** @returns `lists` with decks by name, then wishlists in their current order, then brews by name. */
export function arranged(lists: CardList[]): CardList[] {
  return [
    ...lists.filter((list) => list.kind === 'deck').sort(byName),
    ...lists.filter((list) => list.kind === 'wishlist'),
    ...lists.filter((list) => list.kind === 'brew').sort(byName)
  ]
}

/** @returns `lists` with decks by name, then wishlists in `order`; those not in it come after, by name. */
export function inOrder(lists: CardList[], order: string[]): CardList[] {
  const place = (list: CardList) => {
    const at = order.indexOf(list.name)
    return at < 0 ? order.length : at
  }
  return arranged([...lists].sort((a, b) => place(a) - place(b) || byName(a, b)))
}

/** @returns Wishlist names in order, top first. */
export const wishlistNames = (lists: CardList[]) => lists.filter((list) => list.kind === 'wishlist').map((list) => list.name)

/** Parses trade files (name taken from the file), skipping invalid ones; sorted by name. */
export function toTrades(files: ListFile[]): TradeSnapshot[] {
  const trades: TradeSnapshot[] = []
  for (const file of files) {
    try {
      trades.push({ ...parseTradeText(file.text, file.name), name: file.name })
    } catch {}
  }
  return trades.sort(byName)
}

/** Parses a list file; `text` is normalized via re-serialization. */
export function toCardList(kind: ListKind, { name, text }: ListFile): CardList {
  const lines = parseList(text)
  return { kind, name, lines, text: serializeList(lines) }
}

/** The trade files each trades array was read from, so a reload parses them only when they change. */
const tradeSources = new WeakMap<TradeSnapshot[], string>()

/**
 * @returns The state for freshly loaded files, reusing every list, inventory and trade list whose
 * content is unchanged; null if nothing changed (and not `force`).
 */
export function mergeLoaded(previous: LibraryState, data: LoadedData, force = false): LibraryState | null {
  let changed = force || previous.status !== 'ready' || previous.dataDir !== data.dataDir
  const files = [
    ...data.decks.map((file) => ({ kind: 'deck' as const, file })),
    ...data.wishlists.map((file) => ({ kind: 'wishlist' as const, file })),
    ...data.brews.map((file) => ({ kind: 'brew' as const, file }))
  ]
  const read = files.map(({ kind, file }) => {
    const existing = previous.lists.find((list) => list.kind === kind && list.name === file.name)
    // The app writes lists as it keeps them, so unchanged files need no parsing.
    if (existing && existing.text === file.text) return existing
    const fresh = toCardList(kind, file)
    if (existing && existing.text === fresh.text) return existing
    changed = true
    return fresh
  })
  const lists = inOrder(read, data.wishlistOrder)
  const ids = (all: CardList[]) => all.map((list) => `${list.kind}/${list.name}`).join('\n')
  if (ids(lists) !== ids(previous.lists)) changed = true
  let inventory = previous.inventory
  if (data.inventory !== inventoryText(previous.inventory)) {
    const fresh = parseInventory(data.inventory)
    if (inventoryText(fresh) !== inventoryText(previous.inventory)) {
      inventory = fresh
      changed = true
    }
  }
  let trades = previous.trades
  const tradeFiles = JSON.stringify(data.trades)
  if (tradeFiles !== tradeSources.get(previous.trades)) {
    const fresh = toTrades(data.trades)
    if (JSON.stringify(fresh) !== JSON.stringify(previous.trades)) {
      trades = fresh
      changed = true
    }
    tradeSources.set(trades, tradeFiles)
  }
  return changed ? { status: 'ready', dataDir: data.dataDir, lists, inventory, trades } : null
}

/** @returns The message for files that could not be read, naming the first. */
export function unreadableMessage([first, ...rest]: string[]): string {
  return (
    `Could not read ${first}${rest.length ? ` and ${rest.length} more` : ''}, so ${rest.length ? 'they are' : 'it is'} ` +
    'hidden for now. Close any program using it, then come back to MTG Dreams.'
  )
}

// Undo history ---------------------------------------------------------------------------

/** Undo history step. */
export interface HistoryEntry {
  id: number
  label: string
  target: ChangeTarget
  /** Target state before the edit. */
  before: ListLine[] | Map<string, InventoryItem>
  /** Target text after the edit; undo applies only while the current text matches. */
  after: string
  /** Epoch ms of the last merged edit. */
  at: number
  announced: boolean
}

/** Max undo steps. */
export const MAX_HISTORY = 50
/** Unannounced edits to the same target within this window merge into one undo step. */
export const MERGE_WITHIN_MS = 1000

/** Undo stack (LIFO) of edits to lists and the inventory. */
export class UndoHistory {
  private entries: HistoryEntry[] = []
  private nextId = 0

  /** Steps held. */
  get size(): number {
    return this.entries.length
  }

  /**
   * Pushes a step, merging into the top one when neither is announced and both edit the same
   * target within {@link MERGE_WITHIN_MS}; keeps the latest {@link MAX_HISTORY}.
   * @returns The new step's id; null when merged.
   */
  record(target: ChangeTarget, before: HistoryEntry['before'], after: string, change: Change, now: number): number | null {
    const top = this.entries.at(-1)
    if (!change.announce && top && !top.announced && sameTarget(top.target, target) && now - top.at < MERGE_WITHIN_MS) {
      top.after = after
      top.at = now
      top.label = change.label
      return null
    }
    const id = ++this.nextId
    this.entries.push({ id, label: change.label, target, before, after, at: now, announced: !!change.announce })
    if (this.entries.length > MAX_HISTORY) this.entries.shift()
    return id
  }

  /**
   * Takes the latest step that still applies (its target's text is still its `after`), dropping the
   * ones above it that no longer do.
   * @param currentText - The target's current text; null if it no longer exists.
   * @param id - Take only this step, and only if it is the latest (toast Undo).
   * @returns The step to revert, or why there is none.
   */
  take(currentText: (target: ChangeTarget) => string | null, id?: number): HistoryEntry | UndoResult {
    if (id !== undefined && this.entries.at(-1)?.id !== id) {
      return this.entries.some((entry) => entry.id === id)
        ? { message: 'You changed more since. Press Ctrl+Z to undo step by step.', kind: 'error' }
        : { message: 'That change can no longer be undone.', kind: 'error' }
    }
    for (let entry = this.entries.pop(); entry; entry = this.entries.pop()) {
      if (currentText(entry.target) === entry.after) return entry
      if (id !== undefined) return { message: 'That change can no longer be undone.', kind: 'error' }
    }
    return { message: 'Nothing to undo', kind: 'info' }
  }

  /** Re-targets a list's steps after rename/move; drops them if `to` is null (deleted). */
  retarget(from: ListRef, to: ListRef | null): void {
    this.entries = this.entries.flatMap((entry) => {
      if (entry.target.type !== 'list' || !sameList(entry.target.list, from)) return [entry]
      return to ? [{ ...entry, target: { type: 'list' as const, list: to } }] : []
    })
  }

  /** Drops every step. */
  clear(): void {
    this.entries = []
  }
}

// List edits -----------------------------------------------------------------------------

/**
 * @returns Lines with `card` added to its board ({@link addToBoard}); commander formats have no
 * sideboard, so everything goes to the main deck there.
 */
export function mergeCard(lines: ListLine[], card: BoardEntry): ListLine[] {
  const side = card.side === true && !listFormat(lines)?.commander
  return addToBoard(lines, card, side ? 'side' : 'main')
}

/** @returns Card name of a line for undo labels; `a card` if not found. */
export function cardName(lists: CardList[], target: ListRef, id: string): string {
  const list = lists.find((l) => sameList(l, target))
  const line = list?.lines.find((l) => l.id === id)
  return line?.kind === 'card' ? line.name : 'a card'
}

/** @returns Name of a list's other-format version for undo labels (`Duel`, `EDH`); `other` if it has none. */
export function formatVersionName(lists: CardList[], target: ListRef): string {
  const list = lists.find((l) => sameList(l, target))
  return (list && variantFor(list.lines)?.label) ?? 'other'
}

/** @returns The undo label of adding `cards`. */
export const addCardsLabel = (cards: BoardEntry[]) =>
  cards.length === 1 ? `Added ${cards[0].qty}× ${cards[0].name}` : `Added ${cards.length} cards`

/** @returns The undo label of setting the commanders to `names`. */
export const commandersLabel = (names: string[]) =>
  names.length === 0 ? 'Removed the commander' : names.length === 1 ? `Made ${names[0]} the commander` : `Made ${names.join(' and ')} the commanders`

/** @returns Lines collapsing a bundled basic's lines `ids` into one unversioned non-foil line of `qty`, at the first one's position. */
export function withBundledQty(lines: ListLine[], ids: string[], qty: number): ListLine[] {
  const [keep] = ids
  return lines
    .filter((line) => line.id === keep || !ids.includes(line.id))
    .map((line) => (line.id === keep && line.kind === 'card' ? { kind: 'card', id: line.id, qty, name: line.name, foil: false } : line))
}

/** @returns `lists` with wishlist `target` moved to place `to` (0 is the top); null if it is not there or already in place. */
export function withMovedWishlist(lists: CardList[], target: ListRef, to: number): CardList[] | null {
  const wishlists = lists.filter((list) => list.kind === 'wishlist')
  const from = wishlists.findIndex((list) => list.name === target.name)
  if (from < 0 || from === to) return null
  const [moved] = wishlists.splice(from, 1)
  wishlists.splice(Math.max(0, Math.min(to, wishlists.length)), 0, moved)
  return [...lists.filter((list) => list.kind !== 'wishlist'), ...wishlists]
}

/** A list and the lines it should get. */
export interface Relink {
  list: CardList
  lines: ListLine[]
}

/** @returns The upgrades of deck `from`, pointed at deck `to`, or made plain wishlists (`to` null). */
export function relinkedUpgrades(lists: CardList[], from: string, to: string | null): Relink[] {
  return lists.flatMap((list) => {
    const deck = list.kind === 'wishlist' ? upgradeOf(list.lines) : null
    return deck !== null && sameDeckName(deck, from) ? [{ list, lines: withUpgradeOf(list.lines, to, upgradeVariant(list.lines)) }] : []
  })
}

/** @returns The upgrades of version `version` of deck `deck`, following it to its new name. */
export function renamedVersionUpgrades(lists: CardList[], deck: string, version: ListVersion, name: string): Relink[] {
  return lists.flatMap((list) => {
    const upgraded = list.kind === 'wishlist' ? upgradeOf(list.lines) : null
    const planned = upgradeVariant(list.lines)
    return upgraded !== null && sameDeckName(upgraded, deck) && planned && sameVersion(planned, version)
      ? [{ list, lines: withUpgradeOf(list.lines, upgraded, name.trim()) }]
      : []
  })
}

// Inventory edits ------------------------------------------------------------------------

/** An inventory and the undo step of the edit that made it. */
export interface InventoryEdit {
  inventory: Map<string, InventoryItem>
  change: Change
}

/** @returns `inventory` with `qty` copies of `name` in all ({@link withTotal}); 0 removes it (announced). */
export function withOwned(inventory: Map<string, InventoryItem>, name: string, qty: number, version?: Version): InventoryEdit {
  const next = new Map(inventory)
  const key = nameKey(name)
  const existing = next.get(key)
  const item = withTotal(existing, name, Math.max(0, qty), version)
  if (item) next.set(key, item)
  else next.delete(key)
  const shown = existing?.name ?? name
  return {
    inventory: next,
    change: qty <= 0 ? { label: `Removed ${shown} from your inventory`, announce: true } : { label: `Changed how many ${shown} you own` }
  }
}

/** @returns `inventory` with copies added, each with its optional version, and how many. */
export function withAddedOwned(
  inventory: Map<string, InventoryItem>,
  items: Array<{ name: string; qty: number } & Partial<Version>>
): { inventory: Map<string, InventoryItem>; cards: number } {
  const next = new Map(inventory)
  let cards = 0
  for (const { name, qty, set, collector, foil } of items) {
    const key = nameKey(name)
    const item = addCopies(next.get(key), name, qty, { set, collector, foil: foil ?? false })
    if (item) next.set(key, item)
    cards += qty
  }
  return { inventory: next, cards }
}

/** @returns `inventory` with a card's copies replaced; none removes it. */
export function withCopies(inventory: Map<string, InventoryItem>, name: string, copies: OwnedCopy[]): InventoryEdit {
  const next = new Map(inventory)
  const key = nameKey(name)
  const shown = next.get(key)?.name ?? name
  const item = itemFromCopies(shown, copies)
  if (item) next.set(key, item)
  else next.delete(key)
  return { inventory: next, change: { label: `Changed the versions of ${shown} you own` } }
}

// Trade lists ----------------------------------------------------------------------------

/** @returns `snapshot` named like the trade list it replaces (same name, any case), and that one. */
export function savedTrade(trades: TradeSnapshot[], snapshot: TradeSnapshot): { saved: TradeSnapshot; replaced?: TradeSnapshot } {
  const replaced = trades.find((t) => t.name.toLowerCase() === snapshot.name.toLowerCase())
  return { saved: { ...snapshot, name: replaced?.name ?? snapshot.name }, replaced }
}

/** @returns `trades` without `replaced`, with `saved`, by name. */
export const withTrade = (trades: TradeSnapshot[], saved: TradeSnapshot, replaced?: TradeSnapshot) =>
  [...trades.filter((t) => t !== replaced), saved].sort(byName)

/**
 * Checks a trade list rename; the name is sanitized for file use.
 * @returns The trade list and its renamed copy; null if there is nothing to rename.
 * @throws Error if the name is empty after sanitization or taken.
 */
export function renamedTrade(trades: TradeSnapshot[], from: string, rawTo: string): { trade: TradeSnapshot; renamed: TradeSnapshot } | null {
  const trade = trades.find((t) => t.name === from)
  const to = tradeName(rawTo, '')
  if (!to) throw new Error('Please enter a name.')
  if (!trade || to === from) return null
  if (trades.some((t) => t !== trade && t.name.toLowerCase() === to.toLowerCase())) {
    throw new Error(`You already have a trade list called "${to}".`)
  }
  return { trade, renamed: { ...trade, name: to } }
}
