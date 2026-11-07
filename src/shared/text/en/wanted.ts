import { counted } from '../../plural'
import { count } from './terms'

/** Most Wanted: what your lists still miss, and buying it. */
export const wanted = {
  title: 'Most Wanted',
  summary: (cards: number, total: string, withDecks: boolean) =>
    `${count.cards(cards)} to buy · ${total} to complete every ${withDecks ? 'Deck and Wishlist' : 'Wishlist'}`,
  stillLoading: (n: number) => ` (${n} still loading)`,
  completers: (n: number) => ` · ${n} complete a list`,
  onTheWay: (n: number) => `${n} ordered, on the way`,
  copyHint: 'As “N Card Name” lines, e.g. for a Cardmarket wants list',
  copyAsText: 'Copy as text',
  copied: (what: string) => `${what} copied to clipboard`,
  cardsToBuy: 'Cards to buy',
  basicLands: 'Basic Lands',
  tokens: 'Tokens',
  tabs: {
    cards: (n: number) => `Cards · ${n}`,
    basics: 'Basic Lands'
  },
  bought: 'Acquired',
  boughtHint: (n: number) => `Add ${n} to your Inventory`,
  markedBought: (qty: number, card: string) => `Marked ${qty}× ${card} as acquired`,
  markedAllBought: (cards: number) => `Marked ${count.cards(cards)} as acquired`,
  ordered: 'Ordered',
  orderedHint: (n: number) => `Mark ${n} as Ordered`,
  unstampHint: 'Remove the Ordered stamp',
  unacquireHint: 'Undo: keep it in Most Wanted',
  stamped: (qty: number, card: string) => `Stamped ${qty}× ${card} as ordered`,
  unstamped: (card: string) => `Removed the Ordered stamp from ${card}`,
  stampedAll: (cards: number) => `Stamped ${count.cards(cards)} as ordered`,
  /** The stamp's small line: `2× · 6 Nov`. */
  stampLine: (qty: number, day: string) => `${qty}× · ${day}`,
  /** How long ago a stamp was set. */
  orderedAgo: (days: number) => `Ordered ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`,
  /** A partly ordered card: `2 of 3 ordered · 6 Nov`. */
  partlyOrdered: (ordered: number, of: number, day: string) => `${ordered} of ${of} ordered · ${day}`,
  partlyOrderedHint: (ago: string, left: number) => `${ago}. ${left} still to buy.`,
  orderedGroup: 'Ordered',
  orderedGroupHint: 'Paid for, not here yet. They leave the totals; click Acquired when they arrive.',
  columns: { card: 'Card', wantedIn: 'Wanted in', toBuy: 'To buy', cost: 'Cost', actions: 'Actions' },
  toBuyHint: 'Copies to buy so every list is covered.',
  noLists: 'No Decks or Wishlists yet.',
  noListsHint: 'Most Wanted gathers the Cards your Decks and Wishlists still miss.',
  newDeck: 'New Deck',
  newWishlist: 'New Wishlist',
  nothingToBuy: 'Nothing to buy.',
  nothingToBuyHint: 'Every Deck and Wishlist Card is in your Inventory, basic Lands aside.',
  filterByName: 'Filter by name…',
  loadingCardData: 'Loading Card data…',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  completes: (lists: string) => `✓ Completes ${lists}`,
  completesHint: 'The last Card these lists miss (basic Lands aside)',
  cheaper: (percent: number) => `↓ ${percent}% cheaper`,
  cheaperHint: 'Cheaper than when it was added to a Wishlist',
  pricier: (percent: number) => `↑ ${percent}% pricier`,
  pricierHint: 'More expensive than when it was added to a Wishlist',
  friendHas: (friend: string, qty: number) => `${friend} has ${qty}`,
  friendsHaveIt: (friends: string[]) => (friends.length === 1 ? `${friends[0]} has it` : `${friends.length} friends have it`),
  owned: (n: number, where: string | null) => `${n} owned${where ? ` · ${where}` : ''}`,
  noMatch: 'No Cards match the current filters.',
  /** A list chip's tooltip: `Deck Burn wants 4, misses 2`. */
  listChip: (deck: boolean, list: string, wants: number | undefined, missing: number | undefined) =>
    `${deck ? 'Deck ' : ''}${list}${wants === undefined ? '' : ` wants ${wants}${missing !== undefined && missing < wants ? `, misses ${missing}` : ''}`}`,
  basics: {
    none: 'No basic Lands needed.',
    hint: (bundled: boolean) =>
      `Basic Lands your lists still need. They're left out of Cards and of list completion${bundled ? '; bundled basic Lands count as free (Settings).' : '.'}`
  },
  tokensTab: {
    none: 'No Wishlist Card creates Tokens, emblems or helpers.',
    unavailable: 'Token data unavailable (Scryfall).',
    hint: 'Tokens, emblems and helpers your Wishlist Cards create, owned or not.'
  },
  planner: {
    title: 'Budget Planner',
    summary: 'How many Cards can you get with this?',
    budget: 'Budget',
    budgetLabel: 'Budget in euros',
    for: 'for',
    covers: (needs: number) => ` · covers ${counted(needs, 'list need')}`,
    completes: (lists: string) => ` · completes ${lists}`,
    completesHint: 'Every Card these lists miss, basic Lands aside',
    shoppingList: 'Shopping list',
    markAll: 'Mark all as acquired',
    stampAll: 'Mark all as ordered',
    nothingFits: 'Nothing fits this budget.',
    unpriced: (cards: number, loading: boolean) => `${count.cards(cards)} without a price ${loading ? '(or still loading) ' : ''}are left out.`
  },
  shelf: {
    title: 'Wishlists by cost to finish',
    earlier: 'Earlier Wishlists',
    more: 'More Wishlists',
    collected: (list: string, owned: number, total: number) => `${list}: ${owned} of ${total} collected`
  }
}
