import { nameKey } from './decklist'
import type { CardInfo } from './types'

const BASIC_LANDS = new Set(
  ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'].flatMap((name) => [name, `snow-covered ${name}`])
)

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(nameKey(name))
}

export type ColorFilter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
export type ColorMode = 'any' | 'exact' | 'within'

export const CARD_TYPES = [
  'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Kindred'
] as const

export interface CardFilters {
  name: string
  /** Matched against color identity, so lands count for the colors they produce. C = colorless. */
  colors: ColorFilter[]
  colorMode: ColorMode
  /** One of CARD_TYPES, or '' for any. */
  type: string
  rarities: string[]
  legendary: boolean
}

export const NO_FILTERS: CardFilters = { name: '', colors: [], colorMode: 'any', type: '', rarities: [], legendary: false }

/** Filters other than the name need Scryfall card data. */
export function needsCardData(filters: CardFilters): boolean {
  return filters.colors.length > 0 || filters.type !== '' || filters.rarities.length > 0 || filters.legendary
}

export function filtersActive(filters: CardFilters): boolean {
  return filters.name.trim() !== '' || needsCardData(filters)
}

/** Words before the "—" on each face: "Legendary Creature — Elf // Land" → Legendary, Creature, Land. */
function typeWords(typeLine: string): string[] {
  return typeLine.split('//').flatMap((face) => face.split('—')[0].trim().split(/\s+/))
}

export function matchesColors(identity: string[], selected: ColorFilter[], mode: ColorMode): boolean {
  const colors: string[] = selected.filter((c) => c !== 'C')
  const wantsColorless = selected.includes('C')
  if (identity.length === 0) return mode === 'within' ? true : wantsColorless && (mode === 'any' || colors.length === 0)
  switch (mode) {
    case 'any':
      return identity.some((c) => colors.includes(c))
    case 'exact':
      return identity.length === colors.length && identity.every((c) => colors.includes(c))
    case 'within':
      return identity.every((c) => colors.includes(c))
  }
}

/**
 * `rarity` is the rarity of the specific printing when there is one. Cards
 * without data (still loading, or unknown to Scryfall) only pass name filters.
 */
export function matchesFilters(
  name: string,
  info: CardInfo | null | undefined,
  rarity: string | undefined,
  filters: CardFilters
): boolean {
  const needle = filters.name.trim().toLowerCase()
  if (needle && !name.toLowerCase().includes(needle)) return false
  if (!needsCardData(filters)) return true
  if (!info) return false
  if (filters.colors.length > 0 && !matchesColors(info.colorIdentity, filters.colors, filters.colorMode)) return false
  const words = typeWords(info.typeLine)
  if (filters.type && !words.includes(filters.type) && !(filters.type === 'Kindred' && words.includes('Tribal'))) {
    return false
  }
  if (filters.legendary && !words.includes('Legendary')) return false
  if (filters.rarities.length > 0 && !filters.rarities.includes(rarity ?? info.rarity)) return false
  return true
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type CardSort = 'name' | 'mana' | 'color' | 'rarity' | 'type'

export interface Sortable {
  name: string
  info?: CardInfo | null
  rarity?: string
}

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land']
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common']

function sortValue(sort: Exclude<CardSort, 'name'>, card: Sortable): number {
  const info = card.info
  if (!info) return Number.MAX_SAFE_INTEGER // unknown cards go last
  switch (sort) {
    case 'mana':
      return info.manaValue
    case 'color': {
      // White, blue, black, red, green, then multicolor, then colorless.
      const identity = info.colorIdentity
      if (identity.length === 0) return 100
      return identity.length === 1 ? 'WUBRG'.indexOf(identity[0]) : 10 + identity.length
    }
    case 'rarity': {
      const index = RARITY_ORDER.indexOf(card.rarity ?? info.rarity)
      return index < 0 ? RARITY_ORDER.length : index
    }
    case 'type': {
      const words = typeWords(info.typeLine)
      const index = TYPE_ORDER.findIndex((type) => words.includes(type))
      return index < 0 ? TYPE_ORDER.length : index
    }
  }
}

// One sort, chosen anywhere and applied everywhere. Views that don't offer the
// chosen sort use the closest one they have.

export type SortView = 'deck' | 'wishlist' | 'inventory'

const LISTS: SortView[] = ['deck', 'wishlist']
const EVERYWHERE: SortView[] = ['deck', 'wishlist', 'inventory']

export const SORT_OPTIONS = [
  { id: 'file', label: 'List order', views: LISTS },
  { id: 'recent', label: 'Recently added', views: LISTS },
  { id: 'name', label: 'Name', views: EVERYWHERE },
  { id: 'qty', label: 'Quantity', views: EVERYWHERE },
  { id: 'unit', label: 'Unit price', views: LISTS },
  { id: 'value', label: 'Value', views: ['inventory'] },
  { id: 'needed', label: 'Cost still needed', views: ['wishlist'] },
  { id: 'mana', label: 'Mana value', views: EVERYWHERE },
  { id: 'color', label: 'Color', views: EVERYWHERE },
  // Decks and wishlists are already split into type sections.
  { id: 'type', label: 'Type', views: ['inventory'] },
  { id: 'rarity', label: 'Rarity', views: EVERYWHERE }
] as const satisfies ReadonlyArray<{ id: string; label: string; views: readonly SortView[] }>

export type SortKey = (typeof SORT_OPTIONS)[number]['id']

export const DEFAULT_SORT: SortKey = 'file'

export function isSortKey(value: unknown): value is SortKey {
  return SORT_OPTIONS.some((option) => option.id === value)
}

export function sortOptionsFor(view: SortView) {
  return SORT_OPTIONS.filter((option) => (option.views as readonly SortView[]).includes(view))
}

/** Sorts that only need the card itself (see compareCards). */
export function isCardSort(sort: SortKey): sort is CardSort {
  return sort === 'name' || sort === 'mana' || sort === 'color' || sort === 'rarity' || sort === 'type'
}

/** The sort a view uses: the chosen one if it offers it, else the closest one it has. */
export function sortFor(view: SortView, sort: SortKey): SortKey {
  if (sortOptionsFor(view).some((option) => option.id === sort)) return sort
  if (sort === 'needed' && view === 'deck') return 'unit'
  // The nearest thing to a price sort in the other kind of view.
  if ((sort === 'unit' || sort === 'needed') && view === 'inventory') return 'value'
  if (sort === 'value' && view !== 'inventory') return 'unit'
  return view === 'inventory' ? 'name' : 'file'
}

/** Compares by the given key, then by name. */
export function compareCards(sort: CardSort, a: Sortable, b: Sortable): number {
  const byName = a.name.localeCompare(b.name)
  if (sort === 'name') return byName
  return sortValue(sort, a) - sortValue(sort, b) || byName
}

// ---------------------------------------------------------------------------
// Type sections (decks and wishlists)
// ---------------------------------------------------------------------------

export const TYPE_GROUPS = [
  { id: 'Creature', label: 'Creatures' },
  { id: 'Planeswalker', label: 'Planeswalkers' },
  { id: 'Battle', label: 'Battles' },
  { id: 'Instant', label: 'Instants' },
  { id: 'Sorcery', label: 'Sorceries' },
  { id: 'Artifact', label: 'Artifacts' },
  { id: 'Enchantment', label: 'Enchantments' },
  { id: 'Land', label: 'Lands' },
  { id: 'Other', label: 'Other' }
] as const

export type TypeGroup = (typeof TYPE_GROUPS)[number]['id']

// Creature wins (artifact creatures, Dryad Arbor), then Land (artifact lands).
const GROUP_PRIORITY: TypeGroup[] = ['Creature', 'Planeswalker', 'Battle', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']

/** Type words of the front face only: "Legendary Creature — Elf // Land" → Legendary, Creature. */
export function frontTypeWords(typeLine: string): string[] {
  return typeLine.split('//')[0].split('—')[0].trim().split(/\s+/)
}

/** The section a card is listed under, from its front face. Unknown cards go under "Other". */
export function typeGroup(info: CardInfo | null | undefined): TypeGroup {
  if (!info) return 'Other'
  const words = frontTypeWords(info.typeLine)
  return GROUP_PRIORITY.find((type) => words.includes(type)) ?? 'Other'
}
