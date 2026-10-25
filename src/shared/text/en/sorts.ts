import type { SortKey } from '../../cards'
import type { PriceBasis } from '../../types'
import type { WantedSort } from '../../wanted'

/** How Cards can be ordered, in lists and the Inventory. */
export const sorts = {
  file: 'List order',
  recent: 'Recently added',
  name: 'Name',
  qty: 'Quantity',
  owned: 'Owned',
  unit: 'Unit price',
  value: 'Value',
  decks: 'In Decks',
  wanted: 'Wanted in',
  needed: 'Cost still needed',
  mana: 'Mana value',
  color: 'Color',
  type: 'Type',
  rarity: 'Rarity'
} satisfies Record<SortKey, string>

/** How Most Wanted can order the Cards to buy, with what each means. */
export const wantedSorts = {
  value: { label: 'Best value', hint: 'Lowest cost per list served: Decks and your top Wishlists count most, the bottom ones least' },
  lists: { label: 'Most wanted', hint: 'Wanted by the most lists' },
  completion: { label: 'Closest to completing', hint: 'Finishes lists that are nearly done' },
  price: { label: 'Cheapest', hint: 'Lowest cost to buy' },
  name: { label: 'Name', hint: '' },
  mana: { label: 'Mana value', hint: '' },
  color: { label: 'Color', hint: '' },
  type: { label: 'Type', hint: '' },
  rarity: { label: 'Rarity', hint: '' }
} satisfies Record<WantedSort, { label: string; hint: string }>

/** Which Cardmarket price the app shows, with what it means. */
export const priceBases = {
  trend: { label: 'Typical', hint: 'Cardmarket’s price trend.' },
  low: { label: 'Lowest listing', hint: 'The cheapest Copy on offer.' },
  avg30: { label: '30-day average', hint: 'The average sale over the last month.' }
} satisfies Record<PriceBasis, { label: string; hint: string }>
