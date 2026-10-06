import { useMemo } from 'react'
import { copyPool, type CopyPool } from '@shared/copies'
import type { CardList } from '../stores/library'
import { useSettings } from '../stores/settings'

/** @returns Copy claims of all lists in the chosen copies mode, recomputed when lists or the mode change. */
export function useCopyPool(lists: CardList[]): CopyPool {
  const { copies } = useSettings()
  return useMemo(() => copyPool(lists, copies), [lists, copies])
}
