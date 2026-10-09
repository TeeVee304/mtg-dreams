/** List category: decks draw from the inventory; wishlists track cards to acquire. */
export type ListKind = 'deck' | 'wishlist'

/** Parsed card line of a list file, e.g. `4 Lightning Bolt <141> [A25] (F)`. */
export interface CardLine {
  kind: 'card'
  /** Line identifier, unique within its list. */
  id: string
  qty: number
  name: string
  /** Lower-case Scryfall set code. Absent: any printing, priced at the cheapest. */
  set?: string
  /** Goldfish-style `<...>` tag; normally a collector number within `set`. */
  collector?: string
  foil: boolean
}

/** Non-card line (blank, comment, section header). Stored verbatim for lossless round-trips. */
export interface TextLine {
  kind: 'text'
  /** Line identifier, unique within its list. */
  id: string
  text: string
}

/** Any line of a list file. */
export type ListLine = CardLine | TextLine

/** Owned copies of one printing and finish. No `set`: unspecified printing. */
export interface OwnedCopy {
  qty: number
  set?: string
  collector?: string
  foil: boolean
}

/** Inventory entry for one card name. */
export interface InventoryItem {
  name: string
  /** Total copies owned. */
  qty: number
  /** Copies split by printing and finish; quantities sum to `qty`. */
  copies: OwnedCopy[]
}

/**
 * Cardmarket price used for valuation: `trend` (price trend), `low` (lowest listing)
 * or `avg30` (30-day average sale).
 */
export type PriceBasis = 'trend' | 'low' | 'avg30'

/** EUR prices of one finish by basis. Any may be missing; `trend` is the final fallback. */
export type Prices = Partial<Record<PriceBasis, number>>

/** Compact subset of a Scryfall card object for one printing. */
export interface Printing {
  /** Scryfall card id. */
  id: string
  name: string
  /** Lower-case set code. */
  set: string
  setName: string
  collectorNumber: string
  rarity: string
  /** ISO release date (`YYYY-MM-DD`). */
  releasedAt: string
  /** Scryfall language code. */
  lang: string
  /** Scryfall finishes: `nonfoil`, `foil`, `etched`. */
  finishes: string[]
  /** Cardmarket product id; null if unlisted on Cardmarket. */
  cardmarketId: number | null
  /** Non-foil EUR prices. */
  price: Prices
  /** Foil EUR prices. */
  priceFoil: Prices
  imageSmall: string | null
  imageNormal: string | null
  /** Back face image (normal size) of a two-sided card; null otherwise. */
  imageBack: string | null
  cardmarketUrl: string | null
  /** Display variant tags, e.g. "Borderless", "Showcase", "JA". */
  labels: string[]
  /** Printed name when it differs from the oracle name (e.g. Universes Within / Marvel reprints). */
  flavorName?: string
  /** False for gold-bordered and memorabilia printings; never selected as cheapest. */
  autoEligible: boolean
}

/** Index entry of an official preconstructed product (Commander, Challenger, Secret Lair...). */
export interface PreconSummary {
  /** MTGJSON deck file name, e.g. "CallingAllAngels_FDC". */
  fileName: string
  name: string
  /** Upper-case set code. */
  code: string
  /** MTGJSON deck type, e.g. "Commander Deck". */
  type: string
  /** ISO release date. */
  releaseDate: string
}

/** One card entry of a precon decklist. */
export interface PreconCard {
  qty: number
  name: string
  /** Lower-case set code of the included printing. */
  set: string
  collector: string
  foil: boolean
  /** Basic land. */
  basic: boolean
  /** Printed name when it differs from the oracle name. */
  flavorName?: string
  board: 'commander' | 'main' | 'side' | 'other'
  scryfallId: string | null
}

/** Full precon decklist. */
export interface PreconDeck extends PreconSummary {
  cards: PreconCard[]
}

/** Oracle-level card data, shared by all printings. */
export interface CardInfo {
  name: string
  /** Color letters (`W`, `U`, `B`, `R`, `G`). */
  colors: string[]
  colorIdentity: string[]
  typeLine: string
  manaValue: number
  /** Rarity of Scryfall's default printing; used where no printing is specified. */
  rarity: string
  /** Legality by format id: `legal`, `not_legal`, `banned` or `restricted`. */
  legalities: Record<string, string>
  /** Copy-limit override from rules text: `any` (Relentless Rats) or a number (Seven Dwarves). */
  deckLimit?: 'any' | number
  /** Rules text allows this noncreature card as commander. */
  canBeCommander?: true
}

/** Response of a printings lookup. */
export interface PrintingsResult {
  /** Canonical Scryfall name; may differ from the query after fuzzy matching. */
  name: string
  card?: CardInfo
  printings: Printing[]
  /** Epoch ms of the Scryfall fetch. */
  fetchedAt: number
  /** Epoch ms the Cardmarket price guide was published; absent if only Scryfall prices are known. */
  pricedAt?: number
  /** Scryfall has no card by this name. */
  notFound?: boolean
  /** Refresh error; cached data is served instead. */
  staleError?: string
  /**
   * `true`: only the newest page of printings was fetched (basic lands).
   * `false`: all printings were requested; later refreshes fetch all too.
   */
  partial?: boolean
  /** Total paper printings on Scryfall, when `partial`. */
  totalPrintings?: number
}
