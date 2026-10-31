import { count } from './terms'

/** Words used all over: loading, closing, undoing, sorting, steppers. */
export const common = {
  loading: 'Loading…',
  undo: 'Undo',
  /** An action's button, with the shortcut that does it too. */
  withUndoShortcut: (label: string) => `${label} (Ctrl+Z)`,
  close: 'Close',
  back: 'Back',
  /** Names joined into one: `Okaun and Zndrsplt`. */
  and: (names: string[]) => names.join(' and '),
  /** Joins the last two of a list: `A, B and C`. */
  andWord: 'and',
  sort: 'Sort',
  color: 'Color',
  foil: 'Foil',
  noFormat: 'No Format',
  /** Format menus: paper 60-card formats, paper commander formats, then Arena's. */
  formatGroups: { constructed: 'Constructed', commander: 'Commander', arena: 'MTG Arena' },
  decrease: (what: string) => `Decrease ${what}`,
  increase: (what: string) => `Increase ${what}`,
  updatingCardData: 'Updating Card data',
  dataFolderUnreadable: 'Could not read your data folder.',
  sortAppliesEverywhere: 'Applies to all Decks, Wishlists and the Inventory',
  colorDefault: 'Default',
  colorDefaultHint: 'Follow the app color (Settings)'
}

/** The screen shown when drawing the app fails. */
export const crash = {
  title: 'Something went wrong',
  body: 'MTG Dreams hit an unexpected problem. Your Decks, Wishlists and Inventory are safe: every change was already saved to your data folder.',
  reload: 'Reload MTG Dreams',
  carryOn: 'Try to continue'
}

/** How long ago something happened. */
export const time = {
  justNow: 'just now',
  minutesAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  daysAgo: (n: number) => `${n} days ago`
}

/** Cardmarket's daily prices, and how a Wishlist's prices moved since its Cards were added. */
export const prices = {
  loaded: (date: string) => `New Cardmarket prices loaded (${date})`,
  upToDate: (date: string | null) => `Prices are up to date: Cardmarket, ${date ?? 'not loaded yet'}`,
  moves: (cheaper: number, pricier: number) =>
    `${[cheaper > 0 && `${count.cards(cheaper)} cheaper`, pricier > 0 && `${count.cards(pricier)} pricier`].filter(Boolean).join(', ')} than when added`
}
