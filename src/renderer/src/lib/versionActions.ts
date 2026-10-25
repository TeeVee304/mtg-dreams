import type { ListVersion } from '@shared/listVersion'
import type { CardLine } from '@shared/types'
import type { LibraryActions, ListRef } from '../stores/library'
import type { Row } from './summary'

/** What {@link versionActions} needs of the page. */
export interface VersionPage {
  list: ListRef
  /** The version shown (Duel, Counters…). */
  version: ListVersion
  rows: Row[]
  /** Copies of a card the version plays. */
  copiesOf: (name: string) => number
  isCommander: (row: Row) => boolean
  /** A commander was to be cut: they lead every version, so it stays. */
  onCommanderCut: () => void
}

/**
 * Edits as a version's view shows them: quantities, additions and removals become that version's
 * swaps against the list, while other changes (printing, name) apply to the card in every version.
 * The maybeboard is the list's in every version: its lines (not among the version's `rows`) and Cards
 * added to it are edited in the list itself.
 * @returns `actions` with those edits, and `setCopies`, which sets a card's copies in the version.
 */
export function versionActions(actions: LibraryActions, page: VersionPage) {
  const { list, version, rows, copiesOf, isCommander } = page
  /** Sets a card's copies in the version, as swaps. */
  const setCopies = (line: Omit<CardLine, 'id' | 'kind'>, qty: number) => {
    const { qty: _qty, ...card } = line
    actions.setVariantCount(list, version, card, Math.max(0, qty))
  }
  const rowOf = (id: string) => rows.find((row) => row.line.id === id || row.bundledIds?.includes(id))
  /** Takes a row's copies out of the version; the commanders lead every version, so they stay. */
  const cut = (row: Row | undefined) => {
    if (!row) return
    if (isCommander(row)) page.onCommanderCut()
    else setCopies(row.line, copiesOf(row.line.name) - row.line.qty)
  }
  const edits: LibraryActions = {
    ...actions,
    addCards: (target, entries) => {
      const maybe = entries.filter((entry) => entry.board === 'maybe')
      if (maybe.length > 0) actions.addCards(target, maybe)
      for (const { board, ...entry } of entries) if (board !== 'maybe') setCopies(entry, copiesOf(entry.name) + entry.qty)
    },
    updateCard: (target, id, patch) => {
      const row = rowOf(id)
      if (!row) return actions.updateCard(target, id, patch)
      const { qty, ...rest } = patch
      if (qty !== undefined) setCopies(row.line, copiesOf(row.line.name) - row.line.qty + qty)
      if (Object.keys(rest).length > 0) actions.updateCard(target, id, rest)
    },
    removeCard: (target, id) => {
      const row = rowOf(id)
      if (row) cut(row)
      else actions.removeCard(target, id)
    },
    removeCards: (_target, ids) => cut(rowOf(ids[0])),
    setBundledQty: (_target, ids, qty) => {
      const row = rowOf(ids[0])
      if (row) setCopies(row.line, copiesOf(row.line.name) - row.line.qty + qty)
    }
  }
  return { actions: edits, setCopies }
}
