import { CONFLICT_ERROR, type TrackerApi } from '@shared/api'
import { parseInventory, parseList, serializeList } from '@shared/decklist'
import { listFormat, withCommanders, withFormat, withoutMissingCommanders } from '@shared/formats'
import type { Version } from '@shared/inventory'
import { withColor } from '@shared/listColor'
import { withUnbuilt } from '@shared/listUnbuilt'
import { appliedUpgrade, upgradeOf, upgradeTarget, withUpgradeOf } from '@shared/listUpgrade'
import {
  withNamedVersion,
  withoutSwapPair,
  withoutVersion,
  withVariant,
  withVariantCount,
  withVariantText,
  withVersionName,
  type CardPick,
  type ListVersion
} from '@shared/listVersion'
import { moveToBoard, type BoardEntry } from '@shared/sideboard'
import type { ThemeColor } from '@shared/themes'
import { serializeSnapshot, type TradeSnapshot } from '@shared/trade'
import type { InventoryItem, ListKind, ListLine, OwnedCopy } from '@shared/types'
import { ui } from '@shared/text'
import { cleanError } from '../lib/format'
import {
  LOADING,
  UndoHistory,
  addCardsLabel,
  arranged,
  byName,
  cardName,
  commandersLabel,
  conflictOn,
  formatVersionName,
  inventoryText,
  mergeCard,
  mergeLoaded,
  relinkedUpgrades,
  renamedTrade,
  renamedVersionUpgrades,
  sameList,
  savedTrade,
  toCardList,
  unreadableMessage,
  wishlistNames,
  withAddedOwned,
  withBundledQty,
  withCopies,
  withFewerCopies,
  withMovedWishlist,
  withOwned,
  withTrade,
  type CardList,
  type Change,
  type ChangeTarget,
  type Conflict,
  type LibraryState,
  type ListRef,
  type NewCard,
  type UndoResult
} from './libraryCore'

/** The file operations the library needs: the {@link TrackerApi} part it writes through. */
export type LibraryIO = Pick<
  TrackerApi,
  | 'loadData'
  | 'createList'
  | 'writeList'
  | 'renameList'
  | 'moveList'
  | 'deleteList'
  | 'writeWishlistOrder'
  | 'writeInventory'
  | 'writeTrade'
  | 'deleteTrade'
  | 'chooseDataDir'
>

/** {@link LibraryStore} callbacks. */
export interface LibraryCallbacks {
  /** Reports a user-facing error. */
  onError: (message: string) => void
  /** Announced edit made; `undo` reverts it if still latest. */
  onUndoable: (label: string, undo: () => UndoResult) => void
}

/** What the store shows: its state and the pending save conflict. */
export interface LibrarySnapshot {
  state: LibraryState
  conflict: Conflict | null
}

/**
 * The library: lists, inventory and trade lists, kept in memory and written through {@link LibraryIO}.
 * Edits apply optimistically and write immediately; list and inventory edits are undoable (LIFO).
 * A save rejected because the file changed elsewhere becomes the `conflict`. Free of React, so it
 * runs in unit tests with a fake {@link LibraryIO}; `useLibrary` subscribes a component to it.
 */
export class LibraryStore {
  private snapshot: LibrarySnapshot = { state: LOADING, conflict: null }
  private readonly listeners = new Set<() => void>()
  private readonly history = new UndoHistory()
  /** In-flight writes; reloads are skipped while nonzero. */
  private pendingWrites = 0
  /** Last reported unreadable set, to avoid repeat reports. */
  private reportedUnreadable = ''

  /** @param now - Clock for merging undo steps. */
  constructor(
    private readonly io: LibraryIO,
    private readonly callbacks: LibraryCallbacks,
    private readonly now: () => number = Date.now
  ) {}

  /** Subscribes to changes (for `useSyncExternalStore`). @returns Unsubscribe. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** @returns The current snapshot; a new object after every change. */
  readonly getSnapshot = (): LibrarySnapshot => this.snapshot

  /** Latest state; mutations read it, so rapid edits never see a stale one. */
  get state(): LibraryState {
    return this.snapshot.state
  }

  private publish(snapshot: LibrarySnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private commit(state: LibraryState): void {
    this.publish({ ...this.snapshot, state })
  }

  private showConflict(conflict: Conflict | null): void {
    this.publish({ ...this.snapshot, conflict })
  }

  /** Counts a pending write; reports errors, raising only the first conflict. */
  private track(write: Promise<unknown>, target: ChangeTarget): void {
    this.pendingWrites += 1
    write
      .catch((error) => {
        const message = cleanError(error)
        if (!message.startsWith(CONFLICT_ERROR)) this.callbacks.onError(ui.changes.saveFailed(message))
        else if (!this.snapshot.conflict) this.showConflict(conflictOn(target))
      })
      .finally(() => {
        this.pendingWrites -= 1
      })
  }

  /** @returns Current serialized text of the target; null if the list no longer exists. */
  private currentText(target: ChangeTarget): string | null {
    if (target.type === 'inventory') return inventoryText(this.state.inventory)
    return this.state.lists.find((list) => sameList(list, target.list))?.text ?? null
  }

  /** Pushes an undo step; offers Undo in a toast if the change is announced. */
  private record(target: ChangeTarget, before: ListLine[] | Map<string, InventoryItem>, after: string, change: Change): void {
    const id = this.history.record(target, before, after, change, this.now())
    if (id !== null && change.announce) this.callbacks.onUndoable(change.label, () => this.undo(id))
  }

  /**
   * Reloads the data directory, keeping unchanged objects. Skipped while writes are pending or a
   * conflict is open, unless `force`. Reports newly unreadable files.
   */
  private async reload(force = false): Promise<void> {
    if (!force && (this.pendingWrites > 0 || this.snapshot.conflict)) return
    try {
      const data = await this.io.loadData()
      if (!force && this.pendingWrites > 0) return
      const unreadable = data.unreadable.join('\n')
      if (unreadable && unreadable !== this.reportedUnreadable) this.callbacks.onError(unreadableMessage(data.unreadable))
      this.reportedUnreadable = unreadable
      const next = mergeLoaded(this.state, data, force)
      if (next) this.commit(next)
    } catch (error) {
      if (this.state.status === 'loading') this.commit({ ...this.state, status: 'error', error: cleanError(error) })
      else this.callbacks.onError(cleanError(error))
    }
  }

  /** Commits and writes a list's lines if its text changed; records undo if `change` is given. */
  private saveLines(target: ListRef, lines: ListLine[], change?: Change): void {
    const list = this.state.lists.find((l) => sameList(l, target))
    if (!list) return
    const text = serializeList(lines)
    if (text === list.text) return
    this.commit({ ...this.state, lists: this.state.lists.map((l) => (sameList(l, target) ? { ...l, lines, text } : l)) })
    const changeTarget: ChangeTarget = { type: 'list', list: { kind: target.kind, name: target.name } }
    if (change) this.record(changeTarget, list.lines, text, change)
    this.track(this.io.writeList(target.kind, target.name, text), changeTarget)
  }

  /** Applies `update` to a list's lines and saves. */
  private updateLines(target: ListRef, update: (lines: ListLine[]) => ListLine[], change: Change): void {
    const list = this.state.lists.find((l) => sameList(l, target))
    if (list) this.saveLines(target, update(list.lines), change)
  }

  /** Commits and writes the inventory if its text changed; records undo if `change` is given. */
  private saveInventory(inventory: Map<string, InventoryItem>, change?: Change): void {
    const before = this.state.inventory
    const text = inventoryText(inventory)
    if (text === inventoryText(before)) return
    this.commit({ ...this.state, inventory })
    if (change) this.record({ type: 'inventory' }, before, text, change)
    this.track(this.io.writeInventory(text), { type: 'inventory' })
  }

  /**
   * Reverts the latest applicable edit, skipping steps whose target changed since.
   * @param id - Revert only this step, and only if it is the latest (toast Undo).
   */
  private undo(id?: number): UndoResult {
    const taken = this.history.take((target) => this.currentText(target), id)
    if (!('id' in taken)) return taken
    if (taken.target.type === 'list') this.saveLines(taken.target.list, taken.before as ListLine[])
    else this.saveInventory(taken.before as Map<string, InventoryItem>)
    return { message: `Undone: ${taken.label}`, kind: 'info' }
  }

  /** Commits `lists`, kept in {@link arranged} order, and saves the wishlist order if it changed. */
  private commitLists(lists: CardList[]): void {
    const before = wishlistNames(this.state.lists)
    const next = arranged(lists)
    this.commit({ ...this.state, lists: next })
    const after = wishlistNames(next)
    if (after.join('\n') !== before.join('\n')) {
      this.io.writeWishlistOrder(after).catch((error) => this.callbacks.onError(ui.changes.orderFailed(cleanError(error))))
    }
  }

  /** Points the upgrades of deck `from` at deck `to`, or makes them plain wishlists (`to` null); not undoable. */
  private relinkUpgrades(from: string, to: string | null): void {
    for (const { list, lines } of relinkedUpgrades(this.state.lists, from, to)) this.saveLines(list, lines)
  }

  /** Moves a list to the Recycle Bin and drops its undo steps; upgrades of a deck become plain wishlists. */
  private async removeList(target: ListRef): Promise<void> {
    await this.io.deleteList(target.kind, target.name)
    this.history.retarget(target, null)
    this.commitLists(this.state.lists.filter((list) => !sameList(list, target)))
    if (target.kind === 'deck') this.relinkUpgrades(target.name, null)
  }

  /** Resolves the conflict: force-write the app's text if `keepMine`, else force-reload from disk. */
  private async resolveConflict(keepMine: boolean): Promise<void> {
    const current = this.snapshot.conflict
    if (!current) return
    this.showConflict(null)
    if (!keepMine) {
      await this.reload(true)
      return
    }
    const text = this.currentText(current.target)
    if (text === null) return
    this.track(
      current.target.type === 'list'
        ? this.io.writeList(current.target.list.kind, current.target.list.name, text, true)
        : this.io.writeInventory(text, true),
      current.target
    )
  }

  /** The library's mutations; a stable object, so effects depending on it run once. */
  readonly actions = {
    reload: (force = false) => this.reload(force),

    undo: (id?: number) => this.undo(id),
    resolveConflict: (keepMine: boolean) => this.resolveConflict(keepMine),

    /** Adds cards in one write, each to its board (`side`), merging into identical lines there. */
    addCards: (target: ListRef, cards: BoardEntry[]) => {
      this.updateLines(target, (lines) => cards.reduce(mergeCard, lines), { label: addCardsLabel(cards) })
    },

    /** Moves lines to the sideboard (`side`) or main deck, merging into identical lines there. */
    moveCards: (target: ListRef, ids: string[], side: boolean) => {
      this.updateLines(target, (lines) => moveToBoard(lines, ids, side ? 'side' : 'main'), {
        label: ui.changes.moved(cardName(this.state.lists, target, ids[0]), side)
      })
    },

    /** Patches a card line. */
    updateCard: (target: ListRef, id: string, patch: Partial<NewCard>) => {
      this.updateLines(
        target,
        (lines) => lines.map((line) => (line.id === id && line.kind === 'card' ? { ...line, ...patch } : line)),
        { label: ui.changes.changed(cardName(this.state.lists, target, id)) }
      )
    },

    /** Removes a line (and the commander if it was the last copy); announced. */
    removeCard: (target: ListRef, id: string) => {
      this.updateLines(target, (lines) => withoutMissingCommanders(lines.filter((line) => line.id !== id)), {
        label: ui.changes.removed(cardName(this.state.lists, target, id)),
        announce: true
      })
    },

    /** Removes lines (and the commander if no copy remains); announced. */
    removeCards: (target: ListRef, ids: string[]) => {
      this.updateLines(target, (lines) => withoutMissingCommanders(lines.filter((line) => !ids.includes(line.id))), {
        label: ui.changes.removed(cardName(this.state.lists, target, ids[0])),
        announce: true
      })
    },

    /** Takes `qty` copies of a card out of the list itself (and the commander if no copy remains); announced. */
    removeCopies: (target: ListRef, name: string, qty: number) => {
      this.updateLines(target, (lines) => withoutMissingCommanders(withFewerCopies(lines, name, qty)), {
        label: ui.changes.removed(name),
        announce: true
      })
    },

    /** Collapses a bundled basic's lines into one unversioned non-foil line of `qty`, at the first line's position. */
    setBundledQty: (target: ListRef, ids: string[], qty: number) => {
      this.updateLines(target, (lines) => withBundledQty(lines, ids, qty), { label: ui.changes.changed(cardName(this.state.lists, target, ids[0])) })
    },

    /**
     * Sets or clears (`null`) the format header. A new format deletes the list's other-format
     * version (Duel, EDH), which belongs to the format it had; named versions stay.
     */
    setListFormat: (target: ListRef, formatId: string | null) => {
      this.updateLines(
        target,
        (lines) => (listFormat(lines)?.id === formatId ? lines : withVariant(withFormat(lines, formatId), false)),
        { label: ui.changes.format }
      )
    },

    /** Turns a list's other-format version (Duel, EDH) on, as a copy of the list. */
    addFormatVersion: (target: ListRef) => {
      const label = ui.changes.addedVersion(formatVersionName(this.state.lists, target), target.name)
      this.updateLines(target, (lines) => withVariant(lines, true), { label })
    },

    /** Adds a named version, identical to the list until changed. */
    addVersion: (target: ListRef, name: string) => {
      this.updateLines(target, (lines) => withNamedVersion(lines, name), { label: ui.changes.addedVersion(name.trim(), target.name) })
    },

    /** Deletes one of a list's versions and its swaps; announced, with Undo. */
    deleteVersion: (target: ListRef, version: ListVersion) => {
      this.updateLines(target, (lines) => withoutVersion(lines, version), {
        label: ui.changes.deletedVersion(version, target.name),
        announce: true
      })
    },

    /** Renames a named version, keeping its swaps; upgrades of that version follow it. */
    renameVersion: (target: ListRef, version: ListVersion, name: string) => {
      this.updateLines(target, (lines) => withVersionName(lines, version, name), {
        label: ui.changes.renamedVersion(version, target.name, name.trim())
      })
      for (const { list, lines } of renamedVersionUpgrades(this.state.lists, target.name, version, name)) this.saveLines(list, lines)
    },

    /** Replaces a version with an edited decklist, as swaps against the list; announced. */
    replaceVariantText: (target: ListRef, version: ListVersion, text: string) => {
      this.updateLines(target, (lines) => withVariantText(lines, version, text), { label: ui.changes.edited(target.name), announce: true })
    },

    /** Sets a card's copies in a version, as swaps against the list ({@link withVariantCount}). */
    setVariantCount: (target: ListRef, version: ListVersion, card: CardPick, qty: number) => {
      this.updateLines(target, (lines) => withVariantCount(lines, version, card, qty), {
        label: ui.changes.changedIn(card.name, version)
      })
    },

    /** Undoes a pair of a version's swaps ({@link withoutSwapPair}). */
    removeSwapPair: (target: ListRef, version: ListVersion, index: number) => {
      this.updateLines(target, (lines) => withoutSwapPair(lines, version, index), { label: ui.changes.undidSwap(version, target.name) })
    },

    /** Sets or clears (`null`) the color header. */
    setListColor: (target: ListRef, color: ThemeColor | null) => {
      this.updateLines(target, (lines) => withColor(lines, color), { label: ui.changes.color })
    },

    /**
     * Moves a wishlist to place `to` in the wishlist order (0 is the top); its cards count more in
     * Most Wanted the higher it is.
     */
    moveWishlist: (target: ListRef, to: number) => {
      const lists = withMovedWishlist(this.state.lists, target, to)
      if (lists) this.commitLists(lists)
    },

    /** Makes a deck unbuilt, using every owned copy without reserving any, or built again. */
    setUnbuilt: (target: ListRef, unbuilt: boolean) => {
      this.updateLines(target, (lines) => withUnbuilt(lines, unbuilt), {
        label: ui.changes.unbuilt(target.name, unbuilt)
      })
    },

    /**
     * Makes a wishlist an upgrade of a deck (or of one of its versions, named `variant`: Duel, Counters),
     * sharing its copies, or a plain wishlist again (`null`).
     */
    setUpgradeOf: (target: ListRef, deck: string | null, variant: string | null = null) => {
      this.updateLines(target, (lines) => withUpgradeOf(lines, deck, variant), {
        label: ui.changes.upgrade(target.name, deck)
      })
    },

    /**
     * Applies an upgrade: its deck becomes the upgrade's list ({@link appliedUpgrade}) and the
     * upgrade moves to the Recycle Bin.
     * @returns The deck.
     * @throws If the deck no longer exists or the upgrade cannot be deleted.
     */
    applyUpgrade: async (target: ListRef): Promise<ListRef> => {
      const upgrade = this.state.lists.find((list) => sameList(list, target))
      const deck = upgrade ? upgradeTarget(upgrade, this.state.lists) : null
      if (!upgrade || !deck) throw new Error(ui.errors.upgradeGone)
      // Deleted first: if that fails, nothing has changed.
      await this.removeList(target)
      const current = this.state.lists.find((list) => sameList(list, deck)) ?? deck
      this.saveLines(deck, appliedUpgrade(upgrade.lines, current.lines), { label: ui.changes.applied(upgrade.name, deck.name) })
      return { kind: deck.kind, name: deck.name }
    },

    /** Sets the commanders (two for partners); none clears them. */
    setListCommanders: (target: ListRef, names: string[]) => {
      this.updateLines(target, (lines) => withCommanders(lines, names), { label: commandersLabel(names) })
    },

    /** Replaces a list's content from raw text; announced. */
    replaceListText: (target: ListRef, text: string) => {
      this.saveLines(target, parseList(text), { label: ui.changes.edited(target.name), announce: true })
    },

    /** Creates a list file; a wishlist goes to the bottom of the order. @throws If the name is invalid or taken. */
    createList: async (kind: ListKind, rawName: string, text: string): Promise<ListRef> => {
      const list = toCardList(kind, { name: rawName.trim(), text })
      await this.io.createList(kind, list.name, list.text)
      this.commitLists([...this.state.lists, list])
      return { kind, name: list.name }
    },

    /** Renames a list and re-targets its undo steps. @throws If the name is invalid or taken. */
    renameList: async (target: ListRef, rawTo: string): Promise<ListRef> => {
      const to = rawTo.trim()
      await this.io.renameList(target.kind, target.name, to)
      this.history.retarget(target, { kind: target.kind, name: to })
      // A renamed wishlist keeps its place in the order.
      this.commitLists(this.state.lists.map((list) => (sameList(list, target) ? { ...list, name: to } : list)))
      if (target.kind === 'deck') this.relinkUpgrades(target.name, to)
      return { kind: target.kind, name: to }
    },

    /**
     * Moves a list to another kind. A deck made a wishlist goes to the bottom of the order, and its
     * upgrades become plain wishlists; a wishlist made a deck or a brew is no longer an upgrade.
     * @returns New ref; name may be suffixed.
     */
    moveList: async (target: ListRef, to: ListKind): Promise<ListRef> => {
      const name = await this.io.moveList(target.kind, to, target.name)
      this.history.retarget(target, { kind: to, name })
      const source = this.state.lists.find((list) => sameList(list, target))
      const others = this.state.lists.filter((list) => !sameList(list, target))
      this.commitLists(source ? [...others, { ...source, kind: to, name }] : others)
      const moved = { kind: to, name }
      if (target.kind === 'deck' && to !== 'deck') this.relinkUpgrades(target.name, null)
      const list = this.state.lists.find((l) => sameList(l, moved))
      if (to !== 'wishlist' && list && upgradeOf(list.lines) !== null) this.saveLines(moved, withUpgradeOf(list.lines, null))
      return moved
    },

    /** Moves a list to the Recycle Bin and drops its undo steps; upgrades of a deck become plain wishlists. */
    deleteList: (target: ListRef) => this.removeList(target),

    /** Sets total owned copies (see {@link withOwned}); 0 removes the item (announced). */
    setOwned: (name: string, qty: number, version?: Version) => {
      const { inventory, change } = withOwned(this.state.inventory, name, qty, version)
      this.saveInventory(inventory, change)
    },

    /** Adds owned copies in bulk with optional versions. */
    addOwned: (items: Array<{ name: string; qty: number } & Partial<Version>>) => {
      const { inventory, cards } = withAddedOwned(this.state.inventory, items)
      this.saveInventory(inventory, { label: ui.changes.addedToInventory(cards) })
    },

    /** Replaces a card's copies; empty removes the item. */
    setCopies: (name: string, copies: OwnedCopy[]) => {
      const { inventory, change } = withCopies(this.state.inventory, name, copies)
      this.saveInventory(inventory, change)
    },

    /** Saves a trade list, replacing one with the same name (case-insensitive). @returns Saved name. */
    saveTrade: async (snapshot: TradeSnapshot): Promise<string> => {
      const { saved, replaced } = savedTrade(this.state.trades, snapshot)
      await this.io.writeTrade(saved.name, serializeSnapshot(saved))
      this.commit({ ...this.state, trades: withTrade(this.state.trades, saved, replaced) })
      return saved.name
    },

    /**
     * Renames a trade list; the name is sanitized for file use.
     * @returns New name.
     * @throws Error if empty after sanitization or taken.
     */
    renameTrade: async (from: string, rawTo: string): Promise<string> => {
      const rename = renamedTrade(this.state.trades, from, rawTo)
      if (!rename) return from
      const { trade, renamed } = rename
      await this.io.writeTrade(renamed.name, serializeSnapshot(renamed))
      if (renamed.name.toLowerCase() !== from.toLowerCase()) await this.io.deleteTrade(from)
      this.commit({ ...this.state, trades: this.state.trades.map((t) => (t === trade ? renamed : t)).sort(byName) })
      return renamed.name
    },

    /** Moves a trade list to the Recycle Bin. */
    deleteTrade: async (name: string): Promise<void> => {
      await this.io.deleteTrade(name)
      this.commit({ ...this.state, trades: this.state.trades.filter((t) => t.name !== name) })
    },

    /** Replaces the inventory from raw text; announced. */
    replaceInventoryText: (text: string) => {
      this.saveInventory(parseInventory(text), { label: ui.changes.editedInventory, announce: true })
    },

    /** Prompts for a data directory; on change, clears undo and reloads. @returns Whether it changed. */
    chooseDataDir: async (): Promise<boolean> => {
      const dir = await this.io.chooseDataDir()
      if (!dir) return false
      this.history.clear()
      await this.reload(true)
      return true
    }
  }
}

/** Mutations of a {@link LibraryStore}. */
export type LibraryActions = LibraryStore['actions']
