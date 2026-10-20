import { copyPool, type CopyPool } from '@shared/copies'
import { memoLast } from '../lib/memo'
import type { CardList } from '../stores/library'
import { useSettings } from '../stores/settings'

/**
 * @returns The lists that count toward your cards: decks and wishlists, without brews, which are
 * only ideas. The same array for the same lists, so memoized results built on it are shared.
 */
export const plannedLists = memoLast((lists: CardList[]): CardList[] => lists.filter((list) => list.kind !== 'brew'))

/** One copy pool for every component, rebuilt only when the lists or the reserving setting change. */
const sharedPool = memoLast((lists: CardList[], wishlistsReserve: boolean) => copyPool(lists, { wishlistsReserve }))

/**
 * @returns Copy claims of the decks and wishlists ({@link plannedLists}) of `lists`, shared by every
 * caller; wishlists reserve copies when the setting says so.
 */
export function useCopyPool(lists: CardList[]): CopyPool {
  const { wishlistsReserve } = useSettings()
  return sharedPool(plannedLists(lists), wishlistsReserve)
}
