import { copyPool, type CopyPool } from '@shared/copies'
import { memoLast } from '../lib/memo'
import type { CardList } from '../stores/library'
import { useSettings } from '../stores/settings'

/** One copy pool for every component, rebuilt only when the lists or the copies mode change. */
const sharedPool = memoLast(copyPool)

/** @returns Copy claims of all lists in the chosen copies mode, shared by every caller. */
export function useCopyPool(lists: CardList[]): CopyPool {
  const { copies } = useSettings()
  return sharedPool(lists, copies)
}
