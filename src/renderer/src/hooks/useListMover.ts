import type { ListKind } from '@shared/types'
import { ui } from '@shared/text'
import { useToast } from '../components/Toasts'
import { cleanError } from '../lib/format'
import type { LibraryActions, ListRef } from '../stores/library'

/**
 * Moving a list to another kind, told in a toast: `describe` says what became of it, or the toast
 * says why it could not move.
 * @returns `move`, resolving to the moved list, or null if it could not move.
 */
export function useListMover(actions: LibraryActions) {
  const toast = useToast()
  return async (target: ListRef, to: ListKind, describe: (moved: ListRef) => string): Promise<ListRef | null> => {
    try {
      const moved = await actions.moveList(target, to)
      toast(describe(moved))
      return moved
    } catch (error) {
      toast(ui.sidebar.moveFailed(cleanError(error)), 'error')
      return null
    }
  }
}
