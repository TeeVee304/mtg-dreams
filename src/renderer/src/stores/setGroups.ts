import type { SetGroupsProgress } from '@shared/api'
import { findSetGroup, type SetGroup } from '@shared/setGroups'
import { preferredVersions } from '@shared/listPreference'
import type { ListKind, ListLine } from '@shared/types'
import { createSignal } from '../lib/signal'
import { printingsResolutionChanged } from './printings'

/** Set groups, once loaded; null until then. Empty if Scryfall couldn't be reached. */
let groups: SetGroup[] | null = null
/** Pending or finished load. */
let loading: Promise<SetGroup[]> | null = null
/** Checking of new sets while loading; null when there are none to check. */
let progress: SetGroupsProgress | null = null
const changes = createSignal()

/** Delay before loading the groups at startup, so the lists load first. */
export const STARTUP_DELAY_MS = 4000

/**
 * Loads the set groups once; rows resolve again when they arrive. Called at startup, so the
 * Universes picker rarely waits.
 * @returns The groups.
 */
export function loadSetGroups(): Promise<SetGroup[]> {
  if (loading) return loading
  const unsubscribe = window.api.onSetGroupsProgress((next) => {
    progress = next
    changes.emit()
  })
  loading = window.api.getSetGroups().then(
    (loaded) => {
      groups = loaded
      if (loaded.length > 0) printingsResolutionChanged()
      return loaded
    },
    () => {
      loading = null
      groups = []
      return []
    }
  )
  void loading.finally(() => {
    unsubscribe()
    progress = null
    changes.emit()
  })
  return loading
}

/** Hook re-rendering as the groups load. @returns The groups (null while loading) and the checking progress. */
export function useSetGroups(): { groups: SetGroup[] | null; progress: SetGroupsProgress | null } {
  changes.useVersion()
  return { groups, progress }
}

/**
 * @returns The set group a wishlist or brew prefers Versions from, once loaded; undefined for decks,
 * lists with none, or a group no longer known.
 */
export function preferredGroup(list: { kind: ListKind; lines: ListLine[] }): SetGroup | undefined {
  if (list.kind === 'deck') return undefined
  const name = preferredVersions(list.lines)
  if (!name) return undefined
  void loadSetGroups()
  return findSetGroup(groups ?? [], name)
}
