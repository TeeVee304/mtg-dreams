import { useEffect, useState } from 'react'
import { nameKey } from '@shared/decklist'
import type { ListAnalysis } from '@shared/listModel'
import type { Row } from '../lib/summary'
import type { CardList, LibraryActions } from '../stores/library'
import { useToast } from '../components/Toasts'

/** How long a just-chosen commander's crown animation plays. */
const CROWN_MS = 1800

/**
 * Picking a list's commander: while picking, the next card clicked leads the list (the commander
 * itself, clicked, steps down). Escape stops picking; picking stops by itself when no card can
 * lead.
 */
export function useCommanderPicking(list: CardList, rows: Row[], analysis: ListAnalysis<Row>, actions: LibraryActions) {
  const toast = useToast()
  const { format, isCommander, canBeCommander } = analysis
  const noun = list.kind === 'deck' ? 'deck' : 'list'
  /** Commander picking mode: the next clicked card becomes commander. */
  const [picking, setPicking] = useState(false)
  /** nameKey of the just-chosen commander, for a brief animation. */
  const [crowned, setCrowned] = useState<string | null>(null)

  /** Picking is useful: a card can lead, or the commander can be removed; until card data loads, none can lead. */
  const canPickCommander = !!format?.commander && rows.some((row) => isCommander(row) || canBeCommander(row))
  useEffect(() => {
    if (!canPickCommander) setPicking(false)
  }, [canPickCommander])
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPicking(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])
  useEffect(() => {
    if (!crowned) return
    const timer = setTimeout(() => setCrowned(null), CROWN_MS)
    return () => clearTimeout(timer)
  }, [crowned])

  const displayName = (row: Row) => row.flavorName ?? row.line.name
  const chooseCommander = (row: Row) => {
    setPicking(false)
    if (isCommander(row)) {
      actions.setListCommander(list, null)
      toast(`${displayName(row)} is no longer your commander`)
      return
    }
    actions.setListCommander(list, row.line.name)
    setCrowned(nameKey(row.line.name))
    toast(`${displayName(row)} now leads this ${noun}`)
  }

  return {
    picking,
    canPickCommander,
    togglePicking: () => setPicking(!picking && canPickCommander),
    /** Picking state of a row; the commander is always pickable, which removes it. */
    pickOf: (row: Row) => (picking ? (isCommander(row) || canBeCommander(row) ? ('ok' as const) : ('no' as const)) : undefined),
    isCrowned: (row: Row) => crowned !== null && nameKey(row.line.name) === crowned,
    chooseCommander
  }
}
