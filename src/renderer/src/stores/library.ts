import { useCallback, useMemo, useRef, useState } from 'react'
import { CONFLICT_ERROR, type ListFile } from '@shared/api'
import {
  nameKey,
  parseInventory,
  parseList,
  serializeInventory,
  serializeList
} from '@shared/decklist'
import { listFormat, withCommander, withFormat, withoutMissingCommander } from '@shared/formats'
import { withColor } from '@shared/listColor'
import { withUnbuilt } from '@shared/listUnbuilt'
import { appliedUpgrade, sameDeckName, upgradeOf, upgradeTarget, upgradeVariant, withUpgradeOf } from '@shared/listUpgrade'
import { variantFor, withVariant, withVariantCount, withVariantText, withoutSwapPair, type CardPick } from '@shared/listVersion'
import { addToBoard, moveToBoard, type BoardEntry } from '@shared/sideboard'
import type { ThemeColor } from '@shared/themes'
import { parseTradeText, serializeSnapshot, tradeName, type TradeSnapshot } from '@shared/trade'
import { addCopies, itemFromCopies, withTotal, type Version } from '@shared/inventory'
import type { CardLine, InventoryItem, ListKind, ListLine, OwnedCopy } from '@shared/types'
import { cardCount, cleanError } from '../lib/format'

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

/** Card line fields for additions. */
export type NewCard = Omit<CardLine, 'id' | 'kind'>

/** Edit target: a list or the inventory. */
export type ChangeTarget = { type: 'list'; list: ListRef } | { type: 'inventory' }

/** Target equality. */
const sameTarget = (a: ChangeTarget, b: ChangeTarget) =>
  a.type === 'inventory' ? b.type === 'inventory' : b.type === 'list' && sameList(a.list, b.list)

/** Save rejected with `CONFLICT_ERROR` (file changed externally). */
export interface Conflict {
  target: ChangeTarget
  /** Display name: quoted list name or `Your inventory`. */
  name: string
}

/** Undo history metadata for an edit. */
interface Change {
  /** Undo label. */
  label: string
  /** Offer Undo in a toast; never merged with adjacent edits. */
  announce?: boolean
}

/** Undo history step. */
interface HistoryEntry {
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
const MAX_HISTORY = 50
/** Unannounced edits to the same target within this window merge into one undo step. */
const MERGE_WITHIN_MS = 1000

/** Undo outcome message. */
export interface UndoResult {
  message: string
  kind: 'info' | 'error'
}

/** {@link useLibrary} callbacks. */
export interface LibraryCallbacks {
  /** Reports a user-facing error. */
  onError: (message: string) => void
  /** Announced edit made; `undo` reverts it if still latest. */
  onUndoable: (label: string, undo: () => UndoResult) => void
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
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** @returns `lists` with decks by name, then wishlists in their current order, then brews by name. */
function arranged(lists: CardList[]): CardList[] {
  return [
    ...lists.filter((list) => list.kind === 'deck').sort(byName),
    ...lists.filter((list) => list.kind === 'wishlist'),
    ...lists.filter((list) => list.kind === 'brew').sort(byName)
  ]
}

/** @returns `lists` with decks by name, then wishlists in `order`; those not in it come after, by name. */
function inOrder(lists: CardList[], order: string[]): CardList[] {
  const place = (list: CardList) => {
    const at = order.indexOf(list.name)
    return at < 0 ? order.length : at
  }
  return arranged([...lists].sort((a, b) => place(a) - place(b) || byName(a, b)))
}

/** @returns Wishlist names in order, top first. */
const wishlistNames = (lists: CardList[]) => lists.filter((list) => list.kind === 'wishlist').map((list) => list.name)

/** Parses trade files (name taken from the file), skipping invalid ones; sorted by name. */
function toTrades(files: ListFile[]): TradeSnapshot[] {
  const trades: TradeSnapshot[] = []
  for (const file of files) {
    try {
      trades.push({ ...parseTradeText(file.text, file.name), name: file.name })
    } catch {}
  }
  return trades.sort(byName)
}

/**
 * @returns Lines with `card` added to its board ({@link addToBoard}); commander formats have no
 * sideboard, so everything goes to the main deck there.
 */
function mergeCard(lines: ListLine[], card: BoardEntry): ListLine[] {
  const side = card.side === true && !listFormat(lines)?.commander
  return addToBoard(lines, card, side ? 'side' : 'main')
}

/** Parses a list file; `text` is normalized via re-serialization. */
function toCardList(kind: ListKind, { name, text }: ListFile): CardList {
  const lines = parseList(text)
  return { kind, name, lines, text: serializeList(lines) }
}

/**
 * Library state hook. Mutations apply optimistically and write immediately; list and inventory edits
 * are undoable (LIFO). Save conflicts surface as `conflict`.
 * @returns `state`, `actions` and the pending `conflict`.
 */
export function useLibrary({ onError, onUndoable }: LibraryCallbacks) {
  const [state, setState] = useState<LibraryState>({
    status: 'loading',
    dataDir: '',
    lists: [],
    inventory: new Map(),
    trades: []
  })
  /** Latest state; mutations read it to avoid stale closures across rapid edits. */
  const ref = useRef(state)
  /** In-flight writes; reloads are skipped while nonzero. */
  const pendingWrites = useRef(0)
  /** Last reported unreadable set, to avoid repeat reports. */
  const reportedUnreadable = useRef('')
  /** Undo stack. */
  const history = useRef<HistoryEntry[]>([])
  const nextHistoryId = useRef(0)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  /** Synchronous mirror of `conflict`. */
  const conflictRef = useRef<Conflict | null>(null)
  /** Latest `undo`, for toast callbacks created earlier. */
  const undoRef = useRef<(id?: number) => UndoResult>(() => ({ message: 'Nothing to undo', kind: 'info' }))

  /** Sets state and {@link ref}. */
  const commit = useCallback((next: LibraryState) => {
    ref.current = next
    setState(next)
  }, [])

  /** Sets the conflict state and ref. */
  const showConflict = useCallback((next: Conflict | null) => {
    conflictRef.current = next
    setConflict(next)
  }, [])

  /** Counts a pending write; reports errors, raising only the first conflict. */
  const track = useCallback(
    (write: Promise<unknown>, target: ChangeTarget) => {
      pendingWrites.current += 1
      write
        .catch((error) => {
          const message = cleanError(error)
          if (!message.startsWith(CONFLICT_ERROR)) {
            onError(`Could not save: ${message}`)
          } else if (!conflictRef.current) {
            showConflict({ target, name: target.type === 'list' ? `“${target.list.name}”` : 'Your inventory' })
          }
        })
        .finally(() => {
          pendingWrites.current -= 1
        })
    },
    [onError, showConflict]
  )

  /** @returns Current serialized text of the target; null if the list no longer exists. */
  const currentText = useCallback((target: ChangeTarget): string | null => {
    if (target.type === 'inventory') return inventoryText(ref.current.inventory)
    return ref.current.lists.find((list) => sameList(list, target.list))?.text ?? null
  }, [])

  /** Pushes an undo step, merging into the top step per {@link MERGE_WITHIN_MS}; announces if requested. */
  const record = useCallback(
    (target: ChangeTarget, before: HistoryEntry['before'], after: string, change: Change) => {
      const now = Date.now()
      const top = history.current.at(-1)
      if (!change.announce && top && !top.announced && sameTarget(top.target, target) && now - top.at < MERGE_WITHIN_MS) {
        top.after = after
        top.at = now
        top.label = change.label
        return
      }
      const id = ++nextHistoryId.current
      history.current.push({ id, label: change.label, target, before, after, at: now, announced: !!change.announce })
      if (history.current.length > MAX_HISTORY) history.current.shift()
      if (change.announce) onUndoable(change.label, () => undoRef.current(id))
    },
    [onUndoable]
  )

  /**
   * Reloads the data directory, preserving unchanged objects. Skipped while writes are pending or a
   * conflict is open, unless `force`. Reports newly unreadable files.
   */
  const reload = useCallback(
    async (force = false) => {
      if (!force && (pendingWrites.current > 0 || conflictRef.current)) return
      try {
        const data = await window.api.loadData()
        if (!force && pendingWrites.current > 0) return
        const unreadable = data.unreadable.join('\n')
        if (unreadable && unreadable !== reportedUnreadable.current) {
          const [first, ...rest] = data.unreadable
          onError(
            `Could not read ${first}${rest.length ? ` and ${rest.length} more` : ''}, so ${rest.length ? 'they are' : 'it is'} ` +
              'hidden for now. Close any program using it, then come back to MTG Dreams.'
          )
        }
        reportedUnreadable.current = unreadable
        const previous = ref.current
        let changed = force || previous.status !== 'ready' || previous.dataDir !== data.dataDir
        const files = [
          ...data.decks.map((file) => ({ kind: 'deck' as const, file })),
          ...data.wishlists.map((file) => ({ kind: 'wishlist' as const, file })),
          ...data.brews.map((file) => ({ kind: 'brew' as const, file }))
        ]
        const read = files.map(({ kind, file }) => {
          const fresh = toCardList(kind, file)
          const existing = previous.lists.find((list) => sameList(list, fresh))
          if (existing && existing.text === fresh.text) return existing
          changed = true
          return fresh
        })
        const lists = inOrder(read, data.wishlistOrder)
        const ids = (all: CardList[]) => all.map((list) => `${list.kind}/${list.name}`).join('\n')
        if (ids(lists) !== ids(previous.lists)) changed = true
        let inventory = parseInventory(data.inventory)
        if (inventoryText(inventory) === inventoryText(previous.inventory)) inventory = previous.inventory
        else changed = true
        let trades = toTrades(data.trades)
        if (JSON.stringify(trades) === JSON.stringify(previous.trades)) trades = previous.trades
        else changed = true
        if (changed) commit({ status: 'ready', dataDir: data.dataDir, lists, inventory, trades })
      } catch (error) {
        if (ref.current.status === 'loading') commit({ ...ref.current, status: 'error', error: cleanError(error) })
        else onError(cleanError(error))
      }
    },
    [commit, onError]
  )

  /** Commits and writes a list's lines if its text changed; records undo if `change` is given. */
  const saveLines = useCallback(
    (target: ListRef, lines: ListLine[], change?: Change) => {
      const list = ref.current.lists.find((l) => sameList(l, target))
      if (!list) return
      const text = serializeList(lines)
      if (text === list.text) return
      commit({
        ...ref.current,
        lists: ref.current.lists.map((l) => (sameList(l, target) ? { ...l, lines, text } : l))
      })
      const changeTarget: ChangeTarget = { type: 'list', list: { kind: target.kind, name: target.name } }
      if (change) record(changeTarget, list.lines, text, change)
      track(window.api.writeList(target.kind, target.name, text), changeTarget)
    },
    [commit, record, track]
  )

  /** Applies `update` to a list's lines and saves. */
  const updateLines = useCallback(
    (target: ListRef, update: (lines: ListLine[]) => ListLine[], change: Change) => {
      const list = ref.current.lists.find((l) => sameList(l, target))
      if (list) saveLines(target, update(list.lines), change)
    },
    [saveLines]
  )

  /** Commits and writes the inventory if its text changed; records undo if `change` is given. */
  const saveInventory = useCallback(
    (inventory: Map<string, InventoryItem>, change?: Change) => {
      const before = ref.current.inventory
      const text = inventoryText(inventory)
      if (text === inventoryText(before)) return
      commit({ ...ref.current, inventory })
      if (change) record({ type: 'inventory' }, before, text, change)
      track(window.api.writeInventory(text), { type: 'inventory' })
    },
    [commit, record, track]
  )

  /**
   * Reverts the latest applicable edit, skipping steps whose target changed since.
   * @param id - Revert only this step, and only if it is the latest (toast Undo).
   */
  const undo = useCallback(
    (id?: number): UndoResult => {
      const entries = history.current
      if (id !== undefined && entries.at(-1)?.id !== id) {
        return entries.some((entry) => entry.id === id)
          ? { message: 'You changed more since. Press Ctrl+Z to undo step by step.', kind: 'error' }
          : { message: 'That change can no longer be undone.', kind: 'error' }
      }
      for (let entry = entries.pop(); entry; entry = entries.pop()) {
        if (currentText(entry.target) !== entry.after) {
          if (id !== undefined) return { message: 'That change can no longer be undone.', kind: 'error' }
          continue
        }
        if (entry.target.type === 'list') saveLines(entry.target.list, entry.before as ListLine[])
        else saveInventory(entry.before as Map<string, InventoryItem>)
        return { message: `Undone: ${entry.label}`, kind: 'info' }
      }
      return { message: 'Nothing to undo', kind: 'info' }
    },
    [currentText, saveInventory, saveLines]
  )
  undoRef.current = undo

  /** Re-targets a list's undo steps after rename/move; drops them if `to` is null (deleted). */
  const retarget = useCallback((from: ListRef, to: ListRef | null) => {
    history.current = history.current.flatMap((entry) => {
      if (entry.target.type !== 'list' || !sameList(entry.target.list, from)) return [entry]
      return to ? [{ ...entry, target: { type: 'list' as const, list: to } }] : []
    })
  }, [])

  /** Commits `lists`, kept in {@link arranged} order, and saves the wishlist order if it changed. */
  const commitLists = useCallback(
    (lists: CardList[]) => {
      const before = wishlistNames(ref.current.lists)
      const next = arranged(lists)
      commit({ ...ref.current, lists: next })
      const after = wishlistNames(next)
      if (after.join('\n') !== before.join('\n')) {
        window.api.writeWishlistOrder(after).catch((error) => onError(`Could not save the wishlist order: ${cleanError(error)}`))
      }
    },
    [commit, onError]
  )

  /** Points the upgrades of deck `from` at deck `to`, or makes them plain wishlists (`to` null); not undoable. */
  const relinkUpgrades = useCallback(
    (from: string, to: string | null) => {
      for (const list of ref.current.lists) {
        const deck = list.kind === 'wishlist' ? upgradeOf(list.lines) : null
        if (deck !== null && sameDeckName(deck, from)) saveLines(list, withUpgradeOf(list.lines, to, upgradeVariant(list.lines)))
      }
    },
    [saveLines]
  )

  /** Moves a list to the Recycle Bin and drops its undo steps; upgrades of a deck become plain wishlists. */
  const removeList = useCallback(
    async (target: ListRef) => {
      await window.api.deleteList(target.kind, target.name)
      retarget(target, null)
      commitLists(ref.current.lists.filter((list) => !sameList(list, target)))
      if (target.kind === 'deck') relinkUpgrades(target.name, null)
    },
    [commitLists, relinkUpgrades, retarget]
  )

  /** Resolves the conflict: force-write the app's text if `keepMine`, else force-reload from disk. */
  const resolveConflict = useCallback(
    async (keepMine: boolean) => {
      const current = conflictRef.current
      if (!current) return
      showConflict(null)
      if (!keepMine) {
        await reload(true)
        return
      }
      const text = currentText(current.target)
      if (text === null) return
      track(
        current.target.type === 'list'
          ? window.api.writeList(current.target.list.kind, current.target.list.name, text, true)
          : window.api.writeInventory(text, true),
        current.target
      )
    },
    [currentText, reload, showConflict, track]
  )

  const actions = useMemo(
    () => ({
      reload,

      undo,
      resolveConflict,

      /** Adds cards in one write, each to its board (`side`), merging into identical lines there. */
      addCards(target: ListRef, cards: BoardEntry[]) {
        const label = cards.length === 1 ? `Added ${cards[0].qty}× ${cards[0].name}` : `Added ${cards.length} cards`
        updateLines(target, (lines) => cards.reduce(mergeCard, lines), { label })
      },

      /** Moves lines to the sideboard (`side`) or main deck, merging into identical lines there. */
      moveCards(target: ListRef, ids: string[], side: boolean) {
        updateLines(target, (lines) => moveToBoard(lines, ids, side ? 'side' : 'main'), {
          label: `Moved ${cardName(target, ids[0])} to the ${side ? 'sideboard' : 'main deck'}`
        })
      },

      /** Patches a card line. */
      updateCard(target: ListRef, id: string, patch: Partial<NewCard>) {
        updateLines(
          target,
          (lines) => lines.map((line) => (line.id === id && line.kind === 'card' ? { ...line, ...patch } : line)),
          { label: `Changed ${cardName(target, id)}` }
        )
      },

      /** Removes a line (and the commander if it was the last copy); announced. */
      removeCard(target: ListRef, id: string) {
        updateLines(target, (lines) => withoutMissingCommander(lines.filter((line) => line.id !== id)), {
          label: `Removed ${cardName(target, id)}`,
          announce: true
        })
      },

      /** Removes lines (and the commander if no copy remains); announced. */
      removeCards(target: ListRef, ids: string[]) {
        updateLines(target, (lines) => withoutMissingCommander(lines.filter((line) => !ids.includes(line.id))), {
          label: `Removed ${cardName(target, ids[0])}`,
          announce: true
        })
      },

      /** Collapses a bundled basic's lines into one unversioned non-foil line of `qty`, at the first line's position. */
      setBundledQty(target: ListRef, ids: string[], qty: number) {
        const [keep] = ids
        updateLines(target, (lines) =>
          lines
            .filter((line) => line.id === keep || !ids.includes(line.id))
            .map((line) =>
              line.id === keep && line.kind === 'card'
                ? { kind: 'card', id: line.id, qty, name: line.name, foil: false }
                : line
            ),
          { label: `Changed ${cardName(target, keep)}` }
        )
      },

      /**
       * Sets or clears (`null`) the format header. A new format deletes the list's other version (Duel,
       * EDH), which belongs to the format it had.
       */
      setListFormat(target: ListRef, formatId: string | null) {
        updateLines(
          target,
          (lines) => (listFormat(lines)?.id === formatId ? lines : withVariant(withFormat(lines, formatId), false)),
          { label: 'Changed the format' }
        )
      },

      /** Turns a list's other version (Duel, EDH) on, as a copy of the list, or off, deleting its swaps. */
      setVariant(target: ListRef, on: boolean) {
        // Deleting a version is announced, with Undo.
        updateLines(target, (lines) => withVariant(lines, on), {
          label: `${on ? 'Added' : 'Deleted'} the ${variantName(target)} version of ${target.name}`,
          announce: !on
        })
      },

      /** Replaces the list's other version with an edited decklist, as swaps against the list; announced. */
      replaceVariantText(target: ListRef, text: string) {
        updateLines(target, (lines) => withVariantText(lines, text), {
          label: `Edited ${target.name}`,
          announce: true
        })
      },

      /** Sets a card's copies in the list's other version, as swaps against the list ({@link withVariantCount}). */
      setVariantCount(target: ListRef, card: CardPick, qty: number) {
        updateLines(target, (lines) => withVariantCount(lines, card, qty), {
          label: `Changed ${card.name} in the ${variantName(target)} version`
        })
      },

      /** Undoes a pair of swaps of the list's other version ({@link withoutSwapPair}). */
      removeSwapPair(target: ListRef, index: number) {
        updateLines(target, (lines) => withoutSwapPair(lines, index), {
          label: `Undid a ${variantName(target)} swap in ${target.name}`
        })
      },

      /** Sets or clears (`null`) the color header. */
      setListColor(target: ListRef, color: ThemeColor | null) {
        updateLines(target, (lines) => withColor(lines, color), { label: 'Changed the color' })
      },

      /**
       * Moves a wishlist to place `to` in the wishlist order (0 is the top); its cards count more in
       * Most Wanted the higher it is.
       */
      moveWishlist(target: ListRef, to: number) {
        const wishlists = ref.current.lists.filter((list) => list.kind === 'wishlist')
        const from = wishlists.findIndex((list) => list.name === target.name)
        if (from < 0 || from === to) return
        const [moved] = wishlists.splice(from, 1)
        wishlists.splice(Math.max(0, Math.min(to, wishlists.length)), 0, moved)
        commitLists([...ref.current.lists.filter((list) => list.kind !== 'wishlist'), ...wishlists])
      },

      /** Makes a deck unbuilt, using every owned copy without reserving any, or built again. */
      setUnbuilt(target: ListRef, unbuilt: boolean) {
        updateLines(target, (lines) => withUnbuilt(lines, unbuilt), {
          label: unbuilt ? `Made ${target.name} unbuilt` : `Made ${target.name} built`
        })
      },

      /**
       * Makes a wishlist an upgrade of a deck (or of its other version, named `variant`: Duel, EDH),
       * sharing its copies, or a plain wishlist again (`null`).
       */
      setUpgradeOf(target: ListRef, deck: string | null, variant: string | null = null) {
        updateLines(target, (lines) => withUpgradeOf(lines, deck, variant), {
          label: deck ? `Made ${target.name} an upgrade of ${deck}` : `Made ${target.name} a plain wishlist`
        })
      },

      /**
       * Applies an upgrade: its deck becomes the upgrade's list ({@link appliedUpgrade}) and the
       * upgrade moves to the Recycle Bin.
       * @returns The deck.
       * @throws If the deck no longer exists or the upgrade cannot be deleted.
       */
      async applyUpgrade(target: ListRef): Promise<ListRef> {
        const upgrade = ref.current.lists.find((list) => sameList(list, target))
        const deck = upgrade ? upgradeTarget(upgrade, ref.current.lists) : null
        if (!upgrade || !deck) throw new Error('The deck it upgrades no longer exists.')
        // Deleted first: if that fails, nothing has changed.
        await removeList(target)
        const current = ref.current.lists.find((list) => sameList(list, deck)) ?? deck
        saveLines(deck, appliedUpgrade(upgrade.lines, current.lines), { label: `Applied ${upgrade.name} to ${deck.name}` })
        return { kind: deck.kind, name: deck.name }
      },

      /** Sets or clears (`null`) the commander header. */
      setListCommander(target: ListRef, name: string | null) {
        updateLines(target, (lines) => withCommander(lines, name), {
          label: name ? `Made ${name} the commander` : 'Removed the commander'
        })
      },

      /** Replaces a list's content from raw text; announced. */
      replaceListText(target: ListRef, text: string) {
        saveLines(target, parseList(text), { label: `Edited ${target.name}`, announce: true })
      },

      /** Creates a list file; a wishlist goes to the bottom of the order. @throws If the name is invalid or taken. */
      async createList(kind: ListKind, rawName: string, text: string): Promise<ListRef> {
        const list = toCardList(kind, { name: rawName.trim(), text })
        await window.api.createList(kind, list.name, list.text)
        commitLists([...ref.current.lists, list])
        return { kind, name: list.name }
      },

      /** Renames a list and re-targets its undo steps. @throws If the name is invalid or taken. */
      async renameList(target: ListRef, rawTo: string): Promise<ListRef> {
        const to = rawTo.trim()
        await window.api.renameList(target.kind, target.name, to)
        retarget(target, { kind: target.kind, name: to })
        // A renamed wishlist keeps its place in the order.
        commitLists(ref.current.lists.map((list) => (sameList(list, target) ? { ...list, name: to } : list)))
        if (target.kind === 'deck') relinkUpgrades(target.name, to)
        return { kind: target.kind, name: to }
      },

      /**
       * Moves a list to another kind. A deck made a wishlist goes to the bottom of the order, and its
       * upgrades become plain wishlists; a wishlist made a deck or a brew is no longer an upgrade.
       * @returns New ref; name may be suffixed.
       */
      async moveList(target: ListRef, to: ListKind): Promise<ListRef> {
        const name = await window.api.moveList(target.kind, to, target.name)
        retarget(target, { kind: to, name })
        const source = ref.current.lists.find((list) => sameList(list, target))
        const others = ref.current.lists.filter((list) => !sameList(list, target))
        commitLists(source ? [...others, { ...source, kind: to, name }] : others)
        const moved = { kind: to, name }
        if (target.kind === 'deck' && to !== 'deck') relinkUpgrades(target.name, null)
        const list = ref.current.lists.find((l) => sameList(l, moved))
        if (to !== 'wishlist' && list && upgradeOf(list.lines) !== null) saveLines(moved, withUpgradeOf(list.lines, null))
        return moved
      },

      /** Moves a list to the Recycle Bin and drops its undo steps; upgrades of a deck become plain wishlists. */
      deleteList: removeList,

      /** Sets total owned copies (see {@link withTotal}); 0 removes the item (announced). */
      setOwned(name: string, qty: number, version?: Version) {
        const inventory = new Map(ref.current.inventory)
        const key = nameKey(name)
        const existing = inventory.get(key)
        const item = withTotal(existing, name, Math.max(0, qty), version)
        if (item) inventory.set(key, item)
        else inventory.delete(key)
        const shown = existing?.name ?? name
        saveInventory(
          inventory,
          qty <= 0
            ? { label: `Removed ${shown} from your inventory`, announce: true }
            : { label: `Changed how many ${shown} you own` }
        )
      },

      /** Adds owned copies in bulk with optional versions. */
      addOwned(items: Array<{ name: string; qty: number } & Partial<Version>>) {
        const inventory = new Map(ref.current.inventory)
        let cards = 0
        for (const { name, qty, set, collector, foil } of items) {
          const key = nameKey(name)
          const item = addCopies(inventory.get(key), name, qty, { set, collector, foil: foil ?? false })
          if (item) inventory.set(key, item)
          cards += qty
        }
        saveInventory(inventory, { label: `Added ${cardCount(cards)} to your inventory` })
      },

      /** Replaces a card's copies; empty removes the item. */
      setCopies(name: string, copies: OwnedCopy[]) {
        const inventory = new Map(ref.current.inventory)
        const key = nameKey(name)
        const existing = inventory.get(key)
        const item = itemFromCopies(existing?.name ?? name, copies)
        if (item) inventory.set(key, item)
        else inventory.delete(key)
        saveInventory(inventory, { label: `Changed the versions of ${existing?.name ?? name} you own` })
      },

      /** Saves a trade list, replacing one with the same name (case-insensitive). @returns Saved name. */
      async saveTrade(snapshot: TradeSnapshot): Promise<string> {
        const existing = ref.current.trades.find((t) => t.name.toLowerCase() === snapshot.name.toLowerCase())
        const saved = { ...snapshot, name: existing?.name ?? snapshot.name }
        await window.api.writeTrade(saved.name, serializeSnapshot(saved))
        commit({
          ...ref.current,
          trades: [...ref.current.trades.filter((t) => t !== existing), saved].sort(byName)
        })
        return saved.name
      },

      /**
       * Renames a trade list; the name is sanitized for file use.
       * @returns New name.
       * @throws Error if empty after sanitization or taken.
       */
      async renameTrade(from: string, rawTo: string): Promise<string> {
        const trade = ref.current.trades.find((t) => t.name === from)
        const to = tradeName(rawTo, '')
        if (!to) throw new Error('Please enter a name.')
        if (!trade || to === from) return from
        if (ref.current.trades.some((t) => t !== trade && t.name.toLowerCase() === to.toLowerCase())) {
          throw new Error(`You already have a trade list called "${to}".`)
        }
        const renamed = { ...trade, name: to }
        await window.api.writeTrade(to, serializeSnapshot(renamed))
        if (to.toLowerCase() !== from.toLowerCase()) await window.api.deleteTrade(from)
        commit({ ...ref.current, trades: ref.current.trades.map((t) => (t === trade ? renamed : t)).sort(byName) })
        return to
      },

      /** Moves a trade list to the Recycle Bin. */
      async deleteTrade(name: string): Promise<void> {
        await window.api.deleteTrade(name)
        commit({ ...ref.current, trades: ref.current.trades.filter((t) => t.name !== name) })
      },

      /** Replaces the inventory from raw text; announced. */
      replaceInventoryText(text: string) {
        saveInventory(parseInventory(text), { label: 'Edited the inventory', announce: true })
      },

      /** Prompts for a data directory; on change, clears undo and reloads. @returns Whether it changed. */
      async chooseDataDir(): Promise<boolean> {
        const dir = await window.api.chooseDataDir()
        if (!dir) return false
        history.current = []
        await reload(true)
        return true
      }
    }),
    [commit, commitLists, relinkUpgrades, reload, removeList, resolveConflict, retarget, saveInventory, saveLines, undo, updateLines]
  )

  /** @returns Name of a list's other version for undo labels (`Duel`, `EDH`); `other` if it has none. */
  function variantName(target: ListRef): string {
    const list = ref.current.lists.find((l) => sameList(l, target))
    return (list && variantFor(list.lines)?.label) ?? 'other'
  }

  /** @returns Card name of a line for undo labels; `a card` if not found. */
  function cardName(target: ListRef, id: string): string {
    const list = ref.current.lists.find((l) => sameList(l, target))
    const line = list?.lines.find((l) => l.id === id)
    return line?.kind === 'card' ? line.name : 'a card'
  }

  return { state, actions, conflict }
}

/** Mutations returned by {@link useLibrary}. */
export type LibraryActions = ReturnType<typeof useLibrary>['actions']
