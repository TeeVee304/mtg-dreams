import type { CompanionRule, Rulebreaker } from './deckRules'
import type { Language } from './languages'
import type { EnergyUse, RampKind } from './manaText'

/** List category: decks draw from the inventory; wishlists track cards to acquire. */
export type ListKind = 'deck' | 'wishlist' | 'brew'


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
  /** `{DE}`: Scryfall language code of the copies; absent for English. Never changes the price. */
  lang?: Language
  /** `{Worthless}`: owned copies left out of the inventory's value (damaged, or not counted). */
  worthless?: true
  /** `{Stand-in}`: a wishlist line whose printing you lack, served by any copy you own of the Card. */
  standIn?: true
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

/** Owned copies of one printing, finish and language. No `set`: unspecified printing. */
export interface OwnedCopy {
  qty: number
  set?: string
  collector?: string
  foil: boolean
  /** Scryfall language code; absent for English. A note only: it never changes the price. */
  lang?: Language
  /** Left out of the inventory's value (damaged, or not counted); still owned for decks and wishlists. */
  worthless?: true
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
  /** Scryfall id of the artwork (front face), shared by printings reusing it; absent in older caches. */
  illustrationId?: string
  /** A Universes Beyond printing (Fallout, Marvel…), by Scryfall's promo types; absent in older caches. */
  universesBeyond?: true
  /** An MTG Arena printing, kept only for cards never printed on paper: never owned. */
  digital?: true
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
  /** Ability letting a second commander lead with this one. */
  partner?: PartnerAbility
  /** On the Commander format's Game Changer list. */
  gameChanger?: true
  /** A Rulebreaker commander's deckbuilding exceptions. */
  rulebreaker?: Rulebreaker
  /** A Companion's deckbuilding condition. */
  companion?: CompanionRule
  /** Its mana cost has a symbol twice (`{R}{R}`), for Jegantha. */
  repeatsSymbol?: true
  /** It has an activated ability, for Zirda. */
  activated?: true
  /** Changeling: every creature type, for Kaheera. */
  changeling?: true
  /** Mana cost of the front face (both halves of a split card), e.g. `{2}{W}{U}`; absent for none. */
  manaCost?: string
  /** Colors of mana it makes, `C` for colorless; a fetch land's, those it finds. Absent for none. */
  produces?: string[]
  /** How a nonland card ramps. */
  ramp?: RampKind
  /** Energy it makes and spends. */
  energy?: EnergyUse
  /**
   * What each face says, for the card's dialog: one entry for a one-faced card, two for a split,
   * Adventure, flip or two-sided card. Absent in card data cached before rules text was kept.
   */
  faces?: CardFace[]
}

/** One face of a card as its Oracle text has it. */
export interface CardFace {
  name: string
  /** E.g. `{2}{W}{U}`; absent for none. */
  manaCost?: string
  typeLine: string
  /** Oracle rules text; empty for none (a vanilla creature). */
  text: string
  /** Power and toughness, e.g. `3/3`. */
  pt?: string
  loyalty?: string
  /** A Battle's defense. */
  defense?: string
}

/** One face of a printing as printed in its language. */
export interface PrintedFace {
  name: string
  typeLine: string
  text: string
}

/** A ruling: a note from Wizards of the Coast or Scryfall on how a card works. */
export interface Ruling {
  /** `YYYY-MM-DD`. */
  date: string
  /** `wotc` or `scryfall`. */
  source: string
  text: string
}

/**
 * Ability to share command: `any` (Partner), `with` (Partner with a named card), `group` (Friends
 * forever, or a `Partner—<group>` kind: any two of the group), `background` (Choose a Background)
 * or `companion` (Doctor's companion, with a Time Lord Doctor).
 */
export type PartnerAbility =
  | { kind: 'any' }
  | { kind: 'with'; name: string }
  | { kind: 'group'; group: string }
  | { kind: 'background' }
  | { kind: 'companion' }

/** A Card shown in its printed language: the printing to look for first, by set code and collector number. */
export interface LocalizedQuery {
  name: string
  lang: Language
  set?: string
  collector?: string
}

/** A printing's images in a language other than English, and its text as printed. */
export interface LocalizedImage {
  imageNormal: string
  /** Back face of a two-sided card; null otherwise. */
  imageBack: string | null
  /** Each face's printed name, type line and rules text; absent when Scryfall has none. */
  faces?: PrintedFace[]
}

/** Response of a printings lookup. */
/** What the card resolver is asked: a name in any language, or a printing by set code and collector number. */
export type CardQuery = { name: string } | { set: string; collector: string }

/** A card the resolver found. */
export interface ResolvedCard {
  /** English name. */
  name: string
  /** Language of the printed name a name query matched; absent for English. */
  lang?: Language
  /** The printing, for a set code and collector number query. */
  set?: string
  collector?: string
  /** A near match (a typo, say), not an exact one: offered, never applied on its own. */
  fuzzy?: true
}

export interface PrintingsResult {
  /** Canonical Scryfall name; may differ from the query: a printed name in another language, or a fuzzy match. */
  name: string
  /** Language of the printed name the query matched; absent when it matched an English name. */
  lang?: Language
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
