import { nameKey } from './decklist'
import type { CardInfo } from './types'

/** Normalized names of basic lands, including Wastes and snow-covered variants. */
const BASIC_LANDS = new Set(
  ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'].flatMap((name) => [name, `snow-covered ${name}`])
)

/**
 * @param name - Card name, any case.
 * @returns Whether the card is a basic land.
 */
export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(nameKey(name))
}

/** Color filter token; `C` = colorless. */
export type ColorFilter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'
/** Color names by letter, WUBRG order, then colorless. */
export const COLOR_NAMES: Record<ColorFilter, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' }
/** Color letters, WUBRG order, then colorless. */
export const COLOR_LETTERS = Object.keys(COLOR_NAMES) as ColorFilter[]
/**
 * Color match mode against color identity: `any` shares a color, `exact` equals the selection,
 * `within` is a subset of it.
 */
export type ColorMode = 'any' | 'exact' | 'within'

/** Card types offered by the type filter. */
export const CARD_TYPES = [
  'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Kindred'
] as const

/** Card list filter state. */
export interface CardFilters {
  /** Case-insensitive name substring. */
  name: string
  /** Matched against color identity. */
  colors: ColorFilter[]
  colorMode: ColorMode
  /** One of {@link CARD_TYPES}; `''` for any. */
  type: string
  /** Accepted Scryfall rarities; empty for any. */
  rarities: string[]
  /** Require the Legendary supertype. */
  legendary: boolean
  /** Mana curve column ({@link curveSlot}): nonland cards of this mana value; null for any. */
  manaValue: number | null
}

/** Filter state matching every card. */
export const NO_FILTERS: CardFilters = {
  name: '',
  colors: [],
  colorMode: 'any',
  type: '',
  rarities: [],
  legendary: false,
  manaValue: null
}

/** Last mana curve column; it gathers this mana value and above. */
export const CURVE_TOP = 7

/** @returns A card's mana curve column (0..{@link CURVE_TOP}); null for lands, which the curve leaves out. */
export function curveSlot(info: CardInfo): number | null {
  if (frontTypeWords(info.typeLine).includes('Land')) return null
  return Math.min(CURVE_TOP, Math.max(0, Math.floor(info.manaValue)))
}

/** @returns Whether any filter besides name is set, i.e. matching requires {@link CardInfo}. */
export function needsCardData(filters: CardFilters): boolean {
  return (
    filters.colors.length > 0 || filters.type !== '' || filters.rarities.length > 0 || filters.legendary || filters.manaValue !== null
  )
}

/** @returns Whether any filter is set. */
export function filtersActive(filters: CardFilters): boolean {
  return filters.name.trim() !== '' || needsCardData(filters)
}

/** Supertype and type words of all faces: `Legendary Creature — Elf // Land` → Legendary, Creature, Land. */
function typeWords(typeLine: string): string[] {
  return typeLine.split('//').flatMap((face) => face.split('—')[0].trim().split(/\s+/))
}

/**
 * @param identity - Card color identity; empty for colorless.
 * @param selected - Selected colors; `C` matches colorless cards.
 * @param mode - See {@link ColorMode}. `within` always accepts colorless cards.
 */
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
 * @param info - Card data; when missing, only the name filter can pass.
 * @param rarity - Rarity of the specific printing; falls back to `info.rarity`.
 * @returns Whether the card passes all filters. Type `Kindred` also matches legacy `Tribal`.
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
  if (filters.manaValue !== null && curveSlot(info) !== filters.manaValue) return false
  return true
}

/** Sort keys computable from card data alone. */
export type CardSort = 'name' | 'mana' | 'color' | 'rarity' | 'type'

/** Minimal card shape accepted by {@link compareCards}. */
export interface Sortable {
  name: string
  info?: CardInfo | null
  /** Printing rarity; overrides `info.rarity`. */
  rarity?: string
}

/** Type sort precedence. */
const TYPE_ORDER = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land']
/** Rarity sort precedence. */
const RARITY_ORDER = ['mythic', 'rare', 'uncommon', 'common']

/** Numeric sort rank; cards without `info` sort last. Color order: W, U, B, R, G, multicolor, colorless. */
function sortValue(sort: Exclude<CardSort, 'name'>, card: Sortable): number {
  const info = card.info
  if (!info) return Number.MAX_SAFE_INTEGER
  switch (sort) {
    case 'mana':
      return info.manaValue
    case 'color': {
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

/** Views sharing the global sort setting. */
export type SortView = 'deck' | 'wishlist' | 'inventory'

const LISTS: SortView[] = ['deck', 'wishlist']
const EVERYWHERE: SortView[] = ['deck', 'wishlist', 'inventory']

/** Sort options and the views offering each. `type` is inventory-only: lists are already grouped by type. */
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
  { id: 'type', label: 'Type', views: ['inventory'] },
  { id: 'rarity', label: 'Rarity', views: EVERYWHERE }
] as const satisfies ReadonlyArray<{ id: string; label: string; views: readonly SortView[] }>

/** Global sort setting. */
export type SortKey = (typeof SORT_OPTIONS)[number]['id']

/** Default sort: file order. */
export const DEFAULT_SORT: SortKey = 'file'

/** Type guard for {@link SortKey}. */
export function isSortKey(value: unknown): value is SortKey {
  return SORT_OPTIONS.some((option) => option.id === value)
}

/** @returns Sort options offered by `view`. */
export function sortOptionsFor(view: SortView) {
  return SORT_OPTIONS.filter((option) => (option.views as readonly SortView[]).includes(view))
}

/** Type guard: `sort` is a {@link CardSort}, handled by {@link compareCards}. */
export function isCardSort(sort: SortKey): sort is CardSort {
  return sort === 'name' || sort === 'mana' || sort === 'color' || sort === 'rarity' || sort === 'type'
}

/**
 * Maps the global sort to one `view` offers, substituting the nearest equivalent
 * (price sorts map to each other; otherwise `name` for inventory, `file` for lists).
 */
export function sortFor(view: SortView, sort: SortKey): SortKey {
  if (sortOptionsFor(view).some((option) => option.id === sort)) return sort
  if (sort === 'needed' && view === 'deck') return 'unit'
  if ((sort === 'unit' || sort === 'needed') && view === 'inventory') return 'value'
  if (sort === 'value' && view !== 'inventory') return 'unit'
  return view === 'inventory' ? 'name' : 'file'
}

/** Comparator by `sort`, then name. */
export function compareCards(sort: CardSort, a: Sortable, b: Sortable): number {
  const byName = a.name.localeCompare(b.name)
  if (sort === 'name') return byName
  return sortValue(sort, a) - sortValue(sort, b) || byName
}

/** Type sections of decks and wishlists, in display order. */
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

/** Type section id. */
export type TypeGroup = (typeof TYPE_GROUPS)[number]['id']

/** Group precedence for multi-type cards: Creature first, then Land before Artifact. */
const GROUP_PRIORITY: TypeGroup[] = ['Creature', 'Planeswalker', 'Battle', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']

/** Supertype and type words of the front face: `Legendary Creature — Elf // Land` → Legendary, Creature. */
export function frontTypeWords(typeLine: string): string[] {
  return typeLine.split('//')[0].split('—')[0].trim().split(/\s+/)
}

/** @returns Section from the front face's types; `Other` when `info` is missing or matches none. */
/** "Flubs" from "Flubs, the Fool": a card's name up to its comma or second face. */
export const shortName = (name: string) => name.split(/,| \/\/ /)[0]

export function typeGroup(info: CardInfo | null | undefined): TypeGroup {
  if (!info) return 'Other'
  const words = frontTypeWords(info.typeLine)
  return GROUP_PRIORITY.find((type) => words.includes(type)) ?? 'Other'
}
