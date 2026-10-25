import { counted, plural } from '../../plural'
import type { ListKind } from '../../types'

/** The app's vocabulary: its things, always capitalized (Card, Deck, Wishlist…). */
export const terms = {
  /** Each kind of list, as named in labels. */
  kinds: { deck: 'Deck', wishlist: 'Wishlist', brew: 'Brew' } satisfies Record<ListKind, string>,
  /** Each kind of list, in the plural. */
  kindsPlural: { deck: 'Decks', wishlist: 'Wishlists', brew: 'Brews' } satisfies Record<ListKind, string>,
  /** A list page's noun: a Deck, or a list (a Wishlist or a Brew). */
  noun: (isDeck: boolean) => (isDeck ? 'Deck' : 'list'),
  /** The list itself, beside its versions. */
  mainVersion: 'Main'
}

/** A list's boards: where a Card is (Main Deck, Sideboard, Maybeboard). */
export const boards = {
  /** Each board, as labelled. */
  labels: { main: 'Main Deck', side: 'Sideboard', maybe: 'Maybeboard' } as Record<'main' | 'side' | 'maybe', string>,
  /** Each board in a sentence: `to the main Deck`. */
  inSentence: { main: 'main Deck', side: 'Sideboard', maybe: 'Maybeboard' } as Record<'main' | 'side' | 'maybe', string>
}

/** Counts with their noun, plural when not 1: `1 Card`, `2 Cards`. */
export const count = {
  cards: (n: number) => counted(n, 'Card'),
  copies: (n: number) => counted(n, 'Copy', 'Copies'),
  lands: (n: number) => counted(n, 'Land'),
  brews: (n: number) => counted(n, 'Brew'),
  swaps: (n: number) => counted(n, 'swap'),
  creatures: (n: number) => counted(n, 'creature'),
  moreLists: (n: number) => counted(n, 'more list'),
  /** The noun alone: `Card` or `Cards`. */
  cardWord: (n: number) => plural(n, 'Card'),
  /** The noun alone: `Copy` or `Copies`. */
  copyWord: (n: number) => plural(n, 'Copy', 'Copies')
}
