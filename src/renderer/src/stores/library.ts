import { useRef, useState, useSyncExternalStore } from 'react'
import { LibraryStore, type LibraryCallbacks } from './libraryStore'

export { inventoryText, sameList } from './libraryCore'
export type { CardList, ChangeTarget, Conflict, LibraryState, ListRef, NewCard, UndoResult } from './libraryCore'
export type { LibraryActions, LibraryCallbacks } from './libraryStore'

/**
 * Library state hook: one {@link LibraryStore} per component, writing through `window.api`.
 * Mutations apply optimistically and write immediately; list and inventory edits are undoable
 * (LIFO). Save conflicts surface as `conflict`.
 * @returns `state`, `actions` (a stable object) and the pending `conflict`.
 */
export function useLibrary(callbacks: LibraryCallbacks) {
  // The store keeps the latest callbacks without being recreated.
  const latest = useRef(callbacks)
  latest.current = callbacks
  const [store] = useState(
    () =>
      new LibraryStore(window.api, {
        onError: (message) => latest.current.onError(message),
        onUndoable: (label, undo) => latest.current.onUndoable(label, undo)
      })
  )
  const { state, conflict } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return { state, actions: store.actions, conflict }
}
