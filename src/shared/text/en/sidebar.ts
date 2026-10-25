import { count } from './terms'

/** The sidebar: pages, lists, Trades and prices. */
export const sidebar = {
  inventory: 'Inventory',
  mostWanted: 'Most Wanted',
  colors: (colors: string) => `Colors: ${colors}`,
  worth: (value: string) => `Worth ${value}`,
  /** A Deck's size against its format's: `60/100 Cards`. */
  deckSize: (size: string) => `${size} Cards`,
  ownedOf: (owned: number, total: number) => `${owned} of ${total} owned`,
  complete: (cards: number) => `✓ Complete · ${count.cards(cards)}`,
  progress: (owned: number, total: number, toGo: string | null) => `${owned} of ${total}${toGo ? ` · ${toGo} to go` : ''}`,
  newList: (kind: string) => `New ${kind}`,
  collapse: (section: string) => `Collapse ${section}`,
  show: (section: string) => `Show ${section}`,
  findBrew: 'Find a Brew',
  findBrewPlaceholder: 'Find a Brew…',
  showFewer: 'Show fewer',
  showAll: (n: number) => `Show all ${n}`,
  noDecks: 'No Decks yet.',
  noWishlists: 'No Wishlists yet.',
  brewsHint: 'Decks you are toying with, kept out of Most Wanted.',
  trades: 'Trades',
  friends: (n: number) => (n === 0 ? 'No friends yet' : n === 1 ? '1 friend' : `${n} friends`),
  shareTrade: 'Share my Trade list',
  pricesFrom: (date: string) => `Prices from ${date}`,
  noPrices: 'No prices yet',
  refreshHint: 'Check Cardmarket for a newer price guide (also checked hourly)',
  checking: 'Checking…',
  refresh: 'Refresh',
  settings: 'Settings',
  moveFailed: (error: string) => `Could not move the list: ${error}`
}

/** The page shown with no list open. */
export const welcome = {
  title: 'Welcome to MTG Dreams',
  startWithCollection: 'Decks are built from the Cards you own, so start by adding your Collection.',
  pasteCollection: 'Paste your Collection',
  addPrecon: 'Add a Precon you own',
  planFirst: 'Or plan first:',
  newDeck: 'New Deck',
  newWishlist: 'New Wishlist',
  wizardCommander: 'Let the Deck Wizard plan a Commander Deck',
  buildFrom: (cards: number) => `Build a Deck from the ${count.cards(cards)} you own, or plan one with a Wishlist.`,
  newToCommander: 'New to Commander?',
  wizardWithYou: 'Let the Deck Wizard plan a Deck with you'
}
