import { copyPool, type CopyPool } from '@shared/copies'
import { memoLast } from '../lib/memo'
import type { CardList } from '../stores/library'

/** One copy pool for every component, rebuilt only when the lists change. */
const sharedPool = memoLast(copyPool)

/** @returns Copy claims of all lists, shared by every caller. */
export function useCopyPool(lists: CardList[]): CopyPool {
  return sharedPool(lists)
}
