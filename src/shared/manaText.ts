/**
 * What a card's rules text says about mana, for the Statistics panel: whether it ramps (a mana rock,
 * a mana creature, a land search), the colors a fetch land finds, and the energy it makes and spends.
 * Read once, when card data is fetched.
 *
 * @packageDocumentation
 */

/** How a nonland card ramps: a noncreature permanent that makes mana, a creature that does, or a spell or permanent putting lands onto the battlefield. */
export type RampKind = 'rock' | 'creature' | 'search'

/** Energy a card makes and spends, in {E} symbols. */
export interface EnergyUse {
  made: number
  spent: number
}

/** Basic land types and the color each makes. */
const BASIC_COLORS: Record<string, string> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' }

/** Number words in rules text. */
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** A land search putting land onto the battlefield: "search your library for … land card(s) … onto the battlefield". */
const LAND_SEARCH = /search your library for [^.]*?\b(?:land|plains|island|swamp|mountain|forest)s?\b(?: cards?)?[^.]*?onto the battlefield/i

/** The front face's card types, lower case. */
const typesOf = (typeLine: string) => typeLine.split('//')[0].split('—')[0].toLowerCase().split(/\s+/)

/**
 * @param produces - Colors of mana the card makes (Scryfall's `produced_mana`); empty for none.
 * @returns How a nonland card ramps; undefined for lands, rituals and cards that don't.
 */
export function rampKind(typeLine: string, text: string, produces: string[]): RampKind | undefined {
  const types = typesOf(typeLine)
  if (types.includes('land')) return undefined
  const permanent = ['artifact', 'creature', 'enchantment', 'planeswalker', 'battle'].some((type) => types.includes(type))
  if (permanent && produces.length > 0 && /\{T\}[^:]*:\s*Add\b/i.test(text)) return types.includes('creature') ? 'creature' : 'rock'
  if (LAND_SEARCH.test(text)) return 'search'
  return undefined
}

/**
 * @returns The colors a fetch land finds: the basic types it names, or every color for "a basic land
 * card" (the Deck's own colors decide which count); empty if it finds none.
 */
export function fetchedColors(text: string): string[] {
  const search = /search your library for ([^.]*?)card/i.exec(text)?.[1].toLowerCase()
  if (!search) return []
  const named = Object.entries(BASIC_COLORS).filter(([type]) => search.includes(type)).map(([, color]) => color)
  if (named.length > 0) return named
  return /basic land/.test(search) ? ['W', 'U', 'B', 'R', 'G'] : []
}

/** @returns The {E} count of a run like `{E}{E}`, or of `three {E}`. */
function energyCount(symbols: string | undefined, word: string | undefined): number {
  if (symbols) return symbols.length / 3
  return word ? (NUMBERS[word.toLowerCase()] ?? 1) : 0
}

/** @returns Energy a card makes ("you get {E}{E}") and spends ("pay {E}{E}", "pay eight {E}"); undefined without {E}. */
export function energyOf(text: string): EnergyUse | undefined {
  if (!text.includes('{E}')) return undefined
  const sum = (re: RegExp) => [...text.matchAll(re)].reduce((total, match) => total + energyCount(match[1], match[2]), 0)
  const made = sum(/\bget (?:((?:\{E\})+)|(\w+) \{E\})/gi)
  const spent = sum(/\bpay (?:((?:\{E\})+)|(\w+)(?: or more)? \{E\})/gi)
  return made + spent > 0 ? { made, spent } : undefined
}
