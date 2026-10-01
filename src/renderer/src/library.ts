import { useCallback, useMemo, useRef, useState } from 'react'
import { CONFLICT_ERROR, type ListFile } from '../../shared/api'
import {
  nameKey,
  newLineId,
  parseInventory,
  parseList,
  serializeInventory,
  serializeList
} from '../../shared/decklist'
import { withCommander, withFormat, withoutMissingCommander } from '../../shared/formats'
import { parseTradeText, serializeSnapshot, tradeName, type TradeSnapshot } from '../../shared/trade'
import type { CardLine, InventoryItem, ListKind, ListLine } from '../../shared/types'
import { cleanError } from './format'

/** A deck or a wishlist, backed by one text file. */
export interface CardList {
  kind: ListKind
  name: string
  lines: ListLine[]
  /** Normalised file contents, used to detect external edits. */
  text: string
}

/** Identifies a list; a deck and a wishlist may share a name. */
export interface ListRef {
  kind: ListKind
  name: string
}

export const sameList = (a: ListRef, b: ListRef) => a.kind === b.kind && a.name === b.name

export interface LibraryState {
  status: 'loading' | 'ready' | 'error'
  error?: string
  dataDir: string
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  /** Friends' trade lists, named after the friend (and their file). */
  trades: TradeSnapshot[]
}

export type NewCard = Omit<CardLine, 'id' | 'kind'>

/** What one edit changed: a deck or wishlist, or the inventory. */
export type ChangeTarget = { type: 'list'; list: ListRef } | { type: 'inventory' }

const sameTarget = (a: ChangeTarget, b: ChangeTarget) =>
  a.type === 'inventory' ? b.type === 'inventory' : b.type === 'list' && sameList(a.list, b.list)

/** A save refused because the file changed outside the app (e.g. synced from another PC). */
export interface Conflict {
  target: ChangeTarget
  /** The list's name in quotes, or "Your inventory". */
  name: string
}

/** Describes an edit for the undo history. `announce`: offer Undo in a toast (removals, bulk edits). */
interface Change {
  label: string
  announce?: boolean
}

/** One step of the undo history. */
interface HistoryEntry {
  id: number
  label: string
  target: ChangeTarget
  /** What the target held before the edit. */
  before: ListLine[] | Map<string, InventoryItem>
  /** Its saved text right after. Undo only applies while it still holds that. */
  after: string
  at: number
  announced: boolean
}

const MAX_HISTORY = 50
// Edits to the same list this close together (e.g. clicking + four times) undo as one.
const MERGE_WITHIN_MS = 1000

export interface UndoResult {
  message: string
  kind: 'info' | 'error'
}

export interface LibraryCallbacks {
  onError: (message: string) => void
  /** An edit worth announcing was made; `undo` reverts it. */
  onUndoable: (label: string, undo: () => UndoResult) => void
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

/** Reads the saved trade lists, skipping any that can't be read. The file name names the friend. */
function toTrades(files: ListFile[]): TradeSnapshot[] {
  const trades: TradeSnapshot[] = []
  for (const file of files) {
    try {
      trades.push({ ...parseTradeText(file.text, file.name), name: file.name })
    } catch {
      // Not a trade list (e.g. a stray file in the folder).
    }
  }
  return trades.sort(byName)
}

/** Adds a card to lines, merging into an identical line (same name, version and finish). */
function mergeCard(lines: ListLine[], card: NewCard): ListLine[] {
  const key = nameKey(card.name)
  const index = lines.findIndex(
    (line) =>
      line.kind === 'card' &&
      nameKey(line.name) === key &&
      line.set === card.set &&
      (line.collector ?? '') === (card.collector ?? '') &&
      line.foil === card.foil
  )
  if (index < 0) return [...lines, { kind: 'card', id: newLineId(), ...card }]
  return lines.map((line, i) => (i === index && line.kind === 'card' ? { ...line, qty: line.qty + card.qty } : line))
}

function toCardList(kind: ListKind, { name, text }: ListFile): CardList {
  const lines = parseList(text)
  return { kind, name, lines, text: serializeList(lines) }
}

/**
 * All deck, wishlist and inventory state plus the mutations on it. Every
 * change is applied optimistically and written straight to disk. Edits to
 * lists and the inventory can be undone, most recent first.
 */
export function useLibrary({ onError, onUndoable }: LibraryCallbacks) {
  const [state, setState] = useState<LibraryState>({
    status: 'loading',
    dataDir: '',
    lists: [],
    inventory: new Map(),
    trades: []
  })
  // Mutations read from the ref so rapid successive edits never see stale state.
  const ref = useRef(state)
  const pendingWrites = useRef(0)
  /** Files reported as unreadable, so the same ones aren't reported on every reload. */
  const reportedUnreadable = useRef('')
  const history = useRef<HistoryEntry[]>([])
  const nextHistoryId = useRef(0)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const conflictRef = useRef<Conflict | null>(null)
  // Set below; lets toasts announced while saving call the latest undo.
  const undoRef = useRef<(id?: number) => UndoResult>(() => ({ message: 'Nothing to undo', kind: 'info' }))

  const commit = useCallback((next: LibraryState) => {
    ref.current = next
    setState(next)
  }, [])

  const showConflict = useCallback((next: Conflict | null) => {
    conflictRef.current = next
    setConflict(next)
  }, [])

  const track = useCallback(
    (write: Promise<unknown>, target: ChangeTarget) => {
      pendingWrites.current += 1
      write
        .catch((error) => {
          const message = cleanError(error)
          if (!message.startsWith(CONFLICT_ERROR)) {
            onError(`Could not save: ${message}`)
          } else if (!conflictRef.current) {
            // Later saves of the same edits are refused too; one question is enough.
            showConflict({ target, name: target.type === 'list' ? `“${target.list.name}”` : 'Your inventory' })
          }
        })
        .finally(() => {
          pendingWrites.current -= 1
        })
    },
    [onError, showConflict]
  )

  /** The saved text of a list or the inventory, as the app holds it now; null if it's gone. */
  const currentText = useCallback((target: ChangeTarget): string | null => {
    if (target.type === 'inventory') return serializeInventory(ref.current.inventory)
    return ref.current.lists.find((list) => sameList(list, target.list))?.text ?? null
  }, [])

  /** Adds an edit to the undo history, merging quick repeats on the same list. */
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

  /** Re-reads the data folder, keeping unchanged lists as-is. Skipped while writes are pending. */
  const reload = useCallback(
    async (force = false) => {
      // While a conflict is being decided, the app's version must not be replaced unasked.
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
          ...data.wishlists.map((file) => ({ kind: 'wishlist' as const, file }))
        ]
        const lists = files.map(({ kind, file }) => {
          const fresh = toCardList(kind, file)
          const existing = previous.lists.find((list) => sameList(list, fresh))
          if (existing && existing.text === fresh.text) return existing
          changed = true
          return fresh
        })
        if (lists.length !== previous.lists.length) changed = true
        let inventory = parseInventory(data.inventory)
        if (serializeInventory(inventory) === serializeInventory(previous.inventory)) inventory = previous.inventory
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

  /** Saves a list's new lines; `change` adds the edit to the undo history (undoing passes none). */
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

  const updateLines = useCallback(
    (target: ListRef, update: (lines: ListLine[]) => ListLine[], change: Change) => {
      const list = ref.current.lists.find((l) => sameList(l, target))
      if (list) saveLines(target, update(list.lines), change)
    },
    [saveLines]
  )

  const saveInventory = useCallback(
    (inventory: Map<string, InventoryItem>, change?: Change) => {
      const before = ref.current.inventory
      const text = serializeInventory(inventory)
      if (text === serializeInventory(before)) return
      commit({ ...ref.current, inventory })
      if (change) record({ type: 'inventory' }, before, text, change)
      track(window.api.writeInventory(text), { type: 'inventory' })
    },
    [commit, record, track]
  )

  /**
   * Reverts the latest edit, or with `id` that edit only while it's still the latest
   * (an Undo button on its toast). Edits whose list changed since are skipped.
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
          continue // changed since, e.g. edited outside the app
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

  /** Points history entries for a list at its new name or section, or drops them (deleted). */
  const retarget = useCallback((from: ListRef, to: ListRef | null) => {
    history.current = history.current.flatMap((entry) => {
      if (entry.target.type !== 'list' || !sameList(entry.target.list, from)) return [entry]
      return to ? [{ ...entry, target: { type: 'list' as const, list: to } }] : []
    })
  }, [])

  /** Answers a conflict: keep the app's version (overwriting the other), or load the other one. */
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

      /** Adds cards in one write, merging into identical lines. */
      addCards(target: ListRef, cards: NewCard[]) {
        const label = cards.length === 1 ? `Added ${cards[0].qty}× ${cards[0].name}` : `Added ${cards.length} cards`
        updateLines(target, (lines) => cards.reduce(mergeCard, lines), { label })
      },

      updateCard(target: ListRef, id: string, patch: Partial<NewCard>) {
        updateLines(
          target,
          (lines) => lines.map((line) => (line.id === id && line.kind === 'card' ? { ...line, ...patch } : line)),
          { label: `Changed ${cardName(target, id)}` }
        )
      },

      removeCard(target: ListRef, id: string) {
        updateLines(target, (lines) => withoutMissingCommander(lines.filter((line) => line.id !== id)), {
          label: `Removed ${cardName(target, id)}`,
          announce: true
        })
      },

      removeCards(target: ListRef, ids: string[]) {
        updateLines(target, (lines) => withoutMissingCommander(lines.filter((line) => !ids.includes(line.id))), {
          label: `Removed ${cardName(target, ids[0])}`,
          announce: true
        })
      },

      /**
       * New total for a bundled basic land: its lines (any versions) become one
       * plain line with that quantity, where the first of them was.
       */
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

      /** Sets the deck format (stored as a "// Format: ..." line); null for no format. */
      setListFormat(target: ListRef, formatId: string | null) {
        updateLines(target, (lines) => withFormat(lines, formatId), { label: 'Changed the format' })
      },

      /** Sets the commander (stored as a "// Commander: ..." line); null for none. */
      setListCommander(target: ListRef, name: string | null) {
        updateLines(target, (lines) => withCommander(lines, name), {
          label: name ? `Made ${name} the commander` : 'Removed the commander'
        })
      },

      replaceListText(target: ListRef, text: string) {
        saveLines(target, parseList(text), { label: `Edited the text of ${target.name}`, announce: true })
      },

      async createList(kind: ListKind, rawName: string, text: string): Promise<ListRef> {
        const list = toCardList(kind, { name: rawName.trim(), text })
        await window.api.createList(kind, list.name, list.text)
        commit({ ...ref.current, lists: [...ref.current.lists, list].sort(byName) })
        return { kind, name: list.name }
      },

      async renameList(target: ListRef, rawTo: string): Promise<ListRef> {
        const to = rawTo.trim()
        await window.api.renameList(target.kind, target.name, to)
        retarget(target, { kind: target.kind, name: to })
        commit({
          ...ref.current,
          lists: ref.current.lists.map((list) => (sameList(list, target) ? { ...list, name: to } : list)).sort(byName)
        })
        return { kind: target.kind, name: to }
      },

      async moveList(target: ListRef, to: ListKind): Promise<ListRef> {
        const name = await window.api.moveList(target.kind, to, target.name)
        retarget(target, { kind: to, name })
        commit({
          ...ref.current,
          lists: ref.current.lists
            .map((list) => (sameList(list, target) ? { ...list, kind: to, name } : list))
            .sort(byName)
        })
        return { kind: to, name }
      },

      async deleteList(target: ListRef): Promise<void> {
        await window.api.deleteList(target.kind, target.name)
        retarget(target, null)
        commit({ ...ref.current, lists: ref.current.lists.filter((list) => !sameList(list, target)) })
      },

      /** Sets how many copies of a card (any version) you own. 0 removes it. */
      setOwned(name: string, qty: number) {
        const inventory = new Map(ref.current.inventory)
        const key = nameKey(name)
        const existing = inventory.get(key)
        if (qty <= 0) inventory.delete(key)
        else inventory.set(key, { name: existing?.name ?? name, qty })
        const shown = existing?.name ?? name
        saveInventory(
          inventory,
          qty <= 0
            ? { label: `Removed ${shown} from your inventory`, announce: true }
            : { label: `Changed how many ${shown} you own` }
        )
      },

      /**
       * Adds owned copies in bulk. `onlyMissing` tops each card up to the given
       * quantity instead of adding it (importing a deck you already own part of).
       */
      addOwned(items: Array<{ name: string; qty: number }>, onlyMissing = false) {
        const inventory = new Map(ref.current.inventory)
        const wanted = new Map<string, { name: string; qty: number }>()
        for (const { name, qty } of items) {
          const key = nameKey(name)
          wanted.set(key, { name, qty: (wanted.get(key)?.qty ?? 0) + qty })
        }
        for (const [key, { name, qty }] of wanted) {
          const existing = inventory.get(key)
          const owned = existing?.qty ?? 0
          const total = onlyMissing ? Math.max(owned, qty) : owned + qty
          inventory.set(key, { name: existing?.name ?? name, qty: total })
        }
        const cards = [...wanted.values()].reduce((sum, item) => sum + item.qty, 0)
        saveInventory(inventory, { label: `Added ${cards} cards to your inventory` })
      },

      /** Saves a friend's trade list, replacing theirs if one with that name exists. */
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

      async renameTrade(from: string, rawTo: string): Promise<string> {
        const trade = ref.current.trades.find((t) => t.name === from)
        // Friends' names double as file names, so characters Windows won't allow are dropped.
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

      async deleteTrade(name: string): Promise<void> {
        await window.api.deleteTrade(name)
        commit({ ...ref.current, trades: ref.current.trades.filter((t) => t.name !== name) })
      },

      replaceInventoryText(text: string) {
        saveInventory(parseInventory(text), { label: 'Edited the inventory text', announce: true })
      },

      async chooseDataDir(): Promise<boolean> {
        const dir = await window.api.chooseDataDir()
        if (!dir) return false
        history.current = []
        await reload(true)
        return true
      }
    }),
    [commit, reload, resolveConflict, retarget, saveInventory, saveLines, undo, updateLines]
  )

  /** A card's name in a list, for undo labels. */
  function cardName(target: ListRef, id: string): string {
    const list = ref.current.lists.find((l) => sameList(l, target))
    const line = list?.lines.find((l) => l.id === id)
    return line?.kind === 'card' ? line.name : 'a card'
  }

  return { state, actions, conflict }
}

export type LibraryActions = ReturnType<typeof useLibrary>['actions']
