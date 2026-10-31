import { ordinal } from '../../plural'
import { count } from './terms'

/** What a Version or an Upgrade swaps: its Cards out beside its Cards in. */
export const swaps = {
  title: 'Swaps',
  blank: 'N/A',
  changes: (version: string, base: string) => `What the ${version} Version changes from the ${base} Version`,
  counts: (out: number, inn: number) => `${out} out · ${inn} in`,
  out: 'Out',
  in: 'In',
  cutFrom: (base: string) => `Cut from the ${base} Version`,
  onlyIn: (version: string) => `Only in the ${version} Version`,
  none: (version: string) => `No swaps yet: the ${version} Version plays the same Cards. Cut a Card and add another instead below.`,
  /** A Version, for undo labels: `Duel Version`. */
  version: (version: string) => `${version} Version`,
  keep: (card: string, target: string) => `Keep ${card} in the ${target}`,
  keepHint: 'Keep this Card',
  drop: (card: string, target: string) => `Take ${card} out of the ${target}`,
  dropHint: 'Take this Card out',
  owned: 'Owned',
  need: (copies: number) => `Need ${copies}`,
  toFinish: (copies: number) => `To finish (${count.cards(copies)}):`,
  cut: 'Cut a Card from the Deck…',
  addFromInventory: 'Add a Card from your Inventory…  (Ctrl+K)',
  addInstead: 'Add a Card instead…  (Ctrl+K)',
  totalOut: (cards: number) => `${count.cards(cards)} out`,
  totalIn: (cards: number) => `${count.cards(cards)} in`
}

/** The Starting Hand: seven random Cards, mulligans and draws. */
export const startingHand = {
  title: 'Starting Hand',
  mulligan: 'Mulligan',
  draw: 'Draw',
  bottomCard: (card: string) => `Put ${card} on the bottom`,
  status: (mulligans: number, left: number) =>
    `${mulligans === 0 ? 'Opening Hand' : `${ordinal(mulligans)} Mulligan`} · ${left} left in the Library`
}

/** An Upgrade's changes to the Deck it upgrades. */
export const upgradeSwaps = {
  changes: (deck: string) => `What this Upgrade changes in ${deck}`,
  /** The Deck, when the Upgrade plans one of its Versions. */
  deckVersion: (deck: string, version: string) => `${deck} (${version} Version)`,
  none: (deck: string) => `No changes yet: this Upgrade plays the same Cards as ${deck}. Cut a Card or add one below.`,
  cutFrom: (deck: string) => `Cut from ${deck}`,
  added: 'Added by the Upgrade',
  add: 'Add a Card…  (Ctrl+K)',
  target: 'Upgrade',
  fullList: 'Full Upgrade List'
}

/** A Deck's Statistics: mana curve and colors. */
export const stats = {
  title: 'Statistics',
  average: (value: string) => `Average mana value ${value}`,
  loading: (cards: number) => ` · ${count.cards(cards)} loading`,
  filterHint: 'Filter the list by mana value',
  showEvery: 'Click to show every Card',
  show: 'Click to show',
  manaValueRow: 'Mana value',
  /** The chance of having made every land drop by a turn: "on curve", in Magic's words. */
  onCurve: 'On curve',
  /** The land lines, named at their ends. */
  landsLine: 'Lands',
  rampLine: '+Ramp',
  onCurveHint: (turn: number, percent: number, withRamp: number) =>
    `${percent}% to make every Land drop through turn ${turn}\nCounting cheap ramp as Lands: ${withRamp}%`,
  bar: (label: string, cards: number) => `Mana value ${label}: ${count.cards(cards)}`,
  manaValue: (label: string) => `Mana value ${label}`,
  spells: 'Spells',
  creatures: 'Creatures',
  pips: 'Colored pips',
  lands: 'Lands',
  suggested: (n: number) => `${n} suggested`,
  suggestedHint: (deckSize: number, base: number, perManaValue: number) =>
    `Frank Karsten's ${deckSize}-Card formula: ${base} + ${perManaValue.toFixed(2)} × average mana value − 0.28 × cheap ramp`,
  ramp: 'Ramp',
  cheapRamp: (n: number) => `${n} cost 2 or less`,
  rocks: 'Mana Rocks',
  manaCreatures: 'Mana Creatures',
  searches: 'Land Searches',
  sources: 'Colored sources',
  targetHint: (target: number, card: string, turn: number) => `${card} needs ${target} to be cast on turn ${turn}, 9 times in 10`,
  energyMade: 'Energy made',
  energySpent: 'Spent',
  energyOf: (made: number, spent: number) => `Makes ${made}, spends ${spent}`
}

/** Tokens a list's Cards make. */
export const deckTokens = {
  title: 'Tokens',
  none: 'No Cards here create Tokens, emblems or helpers.',
  unavailable: 'Token data unavailable (Scryfall).',
  madeBy: (token: string, makers: string) => `${token}\nMade by: ${makers}`,
  chooseVersion: (token: string) => `Choose the Version of ${token}`,
  tokenTitle: (stats: string | null, name: string) => `${stats ? `${stats} ` : ''}${name}`,
  /** The token Versions picker. */
  versions: {
    madeBy: 'Made by',
    count: (n: number) => `(${n} Versions)`,
    universe: (name: string, n: number) => `${name} · ${n}`,
    all: (n: number) => `All · ${n}`,
    loading: 'Finding Versions…',
    none: 'No other Versions found (Scryfall).'
  },
  /** A token's short description: `Elspeth emblem`, `1/1 white and green Elf`. */
  emblem: (name: string) => `${name} emblem`,
  creature: (stats: string | null, colors: string[], name: string) =>
    `${stats ? `${stats} ` : ''}${colors.length > 0 ? colors.join(' and ') : 'colorless'} ${name}`
}

/** Filtering Cards by name, color, type, rarity and mana value. */
export const filters = {
  rarities: { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic rare' } as Record<string, string>,
  colorModes: { any: 'Any of these', exact: 'Exactly these', within: 'Only these' },
  colors: 'Colors',
  colorsHint: 'Colors use color identity, so Lands count too',
  colorMode: 'How colors match',
  colorModeHint: '“Only these” shows Cards that fit within the selected colors, like a Commander color identity',
  cardType: 'Card type',
  allTypes: 'All Types',
  rarity: 'Rarity',
  legendary: 'Legendary',
  manaValueHint: 'Set from the mana curve in Statistics. Click to remove.',
  manaValue: (value: string) => `Mana value ${value} ×`
}
