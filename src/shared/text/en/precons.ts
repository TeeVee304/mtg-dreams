import type { PreconCard } from '../../types'
import { count } from './terms'

/** Adding a precon: search, preview and what it adds. */
export const precons = {
  boards: { commander: 'Commander', main: 'Main Deck', side: 'Sideboard', other: 'Other Cards' } satisfies Record<PreconCard['board'], string>,
  addTo: (cards: number, list: string) => `Add ${count.cards(cards)} to “${list}”`,
  createDeck: (cards: number) => `Create Deck with ${count.cards(cards)}`,
  createList: (brew: boolean, cards: number) => `Create ${brew ? 'Brew' : 'Wishlist'} with ${count.cards(cards)}`,
  titles: {
    'new-deck': 'New Deck from a Precon',
    'new-list': 'New Wishlist from a Precon',
    'new-brew': 'New Brew from a Precon',
    list: 'Add a Precon'
  },
  skipBasics: 'Skip basic Lands',
  exact: "Keep the Precon's exact printings",
  exactHint: 'Pin each Card to the printing in the Deck instead of the cheapest Version',
  addsToInventory: 'Its Cards are also added to your Inventory.',
  pickDeck: 'Pick a Deck',
  search: 'Name, set code or year…',
  deckType: 'Deck type',
  allTypes: 'All Types',
  list: 'Precons',
  loadingIndex: 'Loading decklists…',
  indexFailed: (error: string) => `Could not load decklists: ${error}`,
  noMatch: 'No Decks match.',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total}. Refine the search to see more.`,
  source: 'Decklists from MTGJSON',
  pickToPreview: 'Pick a Deck to see its Cards.',
  loadingDeck: 'Loading decklist…',
  deckFailed: (error: string) => `Could not load this Deck: ${error}`,
  details: (type: string, code: string, released: string | null, cards: number) =>
    `${type} · ${code} · released ${released ?? 'unknown'} · ${count.cards(cards)}`
}
