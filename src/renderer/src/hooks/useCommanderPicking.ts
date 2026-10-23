import { useEffect, useState } from 'react'
import { nameKey } from '@shared/decklist'
import { allowsPartners } from '@shared/formats'
import type { ListAnalysis } from '@shared/listModel'
import type { Row } from '../lib/summary'
import type { CardList, LibraryActions } from '../stores/library'
import { useToast } from '../components/Toasts'

/** How long a just-chosen commander's crown animation plays. */
const CROWN_MS = 1800

/** What a click picks: the commander (replacing the commanders), or a partner joining the only one. */
export type PickMode = 'commander' | 'partner'

/**
 * Picking a list's commanders. In `commander` mode the next card clicked leads the list alone, and a
 * commander clicked steps down. In `partner` mode, offered while the list's only commander has a
 * partner ability, the next card clicked joins it. Escape stops picking; picking stops by itself when
 * no card can be picked.
 */
export function useCommanderPicking(list: CardList, rows: Row[], analysis: ListAnalysis<Row>, actions: LibraryActions) {
  const toast = useToast()
  const { format, isCommander, canBeCommander, canJoin } = analysis
  const noun = list.kind === 'deck' ? 'deck' : 'list'
  /** Picking mode; null while not picking. */
  const [picking, setPicking] = useState<PickMode | null>(null)
  /** nameKey of the just-chosen commander, for a brief animation. */
  const [crowned, setCrowned] = useState<string | null>(null)

  const leaders = rows.filter(isCommander)
  const leader = leaders.length === 1 ? leaders[0] : null
  const ability = format && allowsPartners(format) ? leader?.info?.partner : undefined
  /** What the only commander can take beside it, named for the button: `Partner`, `Background`; null if nothing. */
  const partnerKind: 'Partner' | 'Background' | null = ability ? (ability.kind === 'background' ? 'Background' : 'Partner') : null

  const pickable = (row: Row, mode: PickMode) => (mode === 'partner' ? canJoin(row) : isCommander(row) || canBeCommander(row))
  /** Picking is useful: a card can lead, or a commander can be removed; until card data loads, none can lead. */
  const canPickCommander = !!format?.commander && rows.some((row) => pickable(row, 'commander'))
  /** Some card in the list can join the commander. */
  const canPickPartner = partnerKind !== null && rows.some((row) => pickable(row, 'partner'))
  useEffect(() => {
    if ((picking === 'commander' && !canPickCommander) || (picking === 'partner' && !canPickPartner)) setPicking(null)
  }, [picking, canPickCommander, canPickPartner])
  useEffect(() => {
    if (!picking) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPicking(null)
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
    const mode = picking
    setPicking(null)
    if (mode === 'partner' && leader) {
      actions.setListCommanders(list, [leader.line.name, row.line.name])
      setCrowned(nameKey(row.line.name))
      toast(`${displayName(row)} now shares command with ${displayName(leader)}`)
      return
    }
    if (isCommander(row)) {
      const rest = leaders.filter((other) => other !== row)
      actions.setListCommanders(list, rest.map((other) => other.line.name))
      toast(`${displayName(row)} is no longer your commander${rest.length > 0 ? `; ${displayName(rest[0])} leads alone` : ''}`)
      return
    }
    actions.setListCommanders(list, [row.line.name])
    setCrowned(nameKey(row.line.name))
    toast(`${displayName(row)} now leads this ${noun}`)
  }

  return {
    picking,
    canPickCommander,
    /** `Partner` or `Background` while the only commander can take one; null otherwise. */
    partnerKind,
    canPickPartner,
    /** The only commander's name, which a partner joins; null otherwise. */
    leaderName: leader ? displayName(leader) : null,
    /** Starts picking in a mode, or stops picking. */
    togglePicking: (mode: PickMode) =>
      setPicking(picking === mode ? null : (mode === 'partner' ? canPickPartner : canPickCommander) ? mode : null),
    /** Picking state of a row. */
    pickOf: (row: Row) => (picking ? (pickable(row, picking) ? ('ok' as const) : ('no' as const)) : undefined),
    isCrowned: (row: Row) => crowned !== null && nameKey(row.line.name) === crowned,
    chooseCommander
  }
}
