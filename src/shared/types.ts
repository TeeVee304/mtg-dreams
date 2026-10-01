/** Decks are built from cards you own; wishlists are cards you want. */
export type ListKind = 'deck' | 'wishlist'

/** A card line in a list file, e.g. `4 Lightning Bolt <141> [A25] (F)`. */
export interface CardLine {
  kind: 'card'
  id: string
  qty: number
  name: string
  /** Lower-case Scryfall set code. Absent means "any version, priced at the cheapest". */
  set?: string
  /** Goldfish-style `<...>` tag; normally a collector number within `set`. */
  collector?: string
  foil: boolean
}

/** Any other line (blank, comment, section header...). Kept verbatim so files round-trip. */
export interface TextLine {
  kind: 'text'
  id: string
  text: string
}

export type ListLine = CardLine | TextLine

/** Owned copies of a card in one version and finish; without a set, "any version". */
export interface OwnedCopy {
  qty: number
  set?: string
  collector?: string
  foil: boolean
}

export interface InventoryItem {
  name: string
  /** Copies owned in all. */
  qty: number
  /** The same copies by version and finish; their quantities add up to `qty`. */
  copies: OwnedCopy[]
}

/**
 * Which Cardmarket price a card is valued at: the price trend (what copies typically
 * sell for), the lowest current listing, or the 30-day average sale price.
 */
export type PriceBasis = 'trend' | 'low' | 'avg30'

/** One finish's prices in EUR. Any may be missing; the trend is the one always tried last. */
export type Prices = Partial<Record<PriceBasis, number>>

/** Compact subset of a Scryfall card object for one printing. */
export interface Printing {
  id: string
  name: string
  set: string
  setName: string
  collectorNumber: string
  rarity: string
  releasedAt: string
  lang: string
  finishes: string[]
  /** Cardmarket's product number for this printing (null when Cardmarket doesn't list it). */
  cardmarketId: number | null
  /** Cardmarket prices in EUR, non-foil and foil. */
  price: Prices
  priceFoil: Prices
  imageSmall: string | null
  imageNormal: string | null
  cardmarketUrl: string | null
  /** Human-readable variant tags: "Borderless", "Showcase", "JA", ... */
  labels: string[]
  /**
   * Name printed on this version when it differs from the card's official name, e.g.
   * "Franklin's Finality" on the Marvel reprint of Annie Joins Up.
   */
  flavorName?: string
  /** False for gold-bordered / memorabilia printings, which are never picked as "cheapest". */
  autoEligible: boolean
}

/** An official preconstructed product (Commander deck, Challenger deck, Secret Lair...). */
export interface PreconSummary {
  /** MTGJSON deck file name, e.g. "CallingAllAngels_FDC". */
  fileName: string
  name: string
  /** Set code, upper-case. */
  code: string
  type: string
  releaseDate: string
}

export interface PreconCard {
  qty: number
  name: string
  /** Lower-case set code of the printing in the deck. */
  set: string
  collector: string
  foil: boolean
  basic: boolean
  /** Name printed on this version when it differs from the official name. */
  flavorName?: string
  board: 'commander' | 'main' | 'side' | 'other'
  scryfallId: string | null
}

export interface PreconDeck extends PreconSummary {
  cards: PreconCard[]
}

/** Card-level (oracle) data: the same for every printing of a card. */
export interface CardInfo {
  name: string
  colors: string[]
  colorIdentity: string[]
  typeLine: string
  manaValue: number
  /** Rarity of Scryfall's default printing, for places without a specific printing (the inventory). */
  rarity: string
  /** Scryfall legality per format id: "legal", "not_legal", "banned" or "restricted". */
  legalities: Record<string, string>
  /** Deck-building exception from rules text: "any" (Relentless Rats) or a number (Seven Dwarves). */
  deckLimit?: 'any' | number
  /** Rules text lets this noncreature card be a commander ("can be your commander", Grist). */
  canBeCommander?: true
}

export interface PrintingsResult {
  /** Canonical Scryfall name (may differ from the requested name after a fuzzy match). */
  name: string
  card?: CardInfo
  printings: Printing[]
  fetchedAt: number
  /** When the prices were published (Cardmarket's price guide); absent when only Scryfall's are known. */
  pricedAt?: number
  notFound?: boolean
  /** Set when a refresh failed and cached data is being served instead. */
  staleError?: string
  /**
   * Only the newest printings were fetched (basic lands have hundreds). false
   * means every printing was fetched on request and future refreshes keep it that way.
   */
  partial?: boolean
  /** How many paper printings Scryfall has in total (when `partial`). */
  totalPrintings?: number
}
