import { counted } from '../../plural'
import { count } from './terms'

/** A Version's swaps against the list it varies. */
export const swaps = {
  title: 'Swaps',
  nothingCut: 'Nothing cut',
  nothingIn: 'Nothing instead',
  changes: (version: string, base: string) => `What the ${version} Version changes from the ${base} Version`,
  counts: (out: number, inn: number) => `${out} out · ${inn} in`,
  out: 'Out',
  in: 'In',
  cutFrom: (base: string) => `Cut from the ${base} Version`,
  onlyIn: (version: string) => `Only in the ${version} Version`,
  none: (version: string) => `No swaps yet: the ${version} Version plays the same Cards. Cut a Card and add another instead below.`,
  undo: (cards: string) => `Undo the swap of ${cards}`,
  undoHint: 'Undo this swap',
  swapFor: ' for ',
  cut: 'Cut a Card from the Deck…',
  addFromInventory: 'Add a Card from your Inventory…  (Ctrl+K)',
  addInstead: 'Add a Card instead…  (Ctrl+K)',
  totalOut: (cards: number) => `${count.cards(cards)} out`,
  totalIn: (cards: number) => `${count.cards(cards)} in`
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
  keep: (card: string) => `Keep ${card} in the Upgrade`,
  keepHint: 'Keep this Card',
  drop: (card: string) => `Take ${card} out of the Upgrade`,
  dropHint: 'Take this Card out',
  owned: 'Owned',
  need: (copies: number) => `Need ${copies}`,
  toFinish: (copies: number) => `To finish (${count.cards(copies)}):`,
  fullList: 'Full Upgrade List'
}

/** A Deck's Statistics: mana curve and colors. */
export const stats = {
  title: 'Statistics',
  average: (value: string) => `Average mana value ${value}`,
  loading: (cards: number) => ` · ${count.cards(cards)} loading`,
  curve: 'Mana curve',
  creatures: 'Creatures',
  otherSpells: 'Other spells',
  filterHint: 'Filter the list by mana value',
  manaValue: 'Mana Value',
  showEvery: 'Click to show every Card',
  show: 'Click to show',
  averageLabel: 'Average mana value:',
  bar: (label: string, cards: number, creatures: number) => `Mana value (${label}): ${count.cards(cards)}, ${counted(creatures, 'creature')}`,
  multicolor: 'Multicolor',
  colors: 'Color distribution',
  multicolorHint: 'Multicolored Cards count toward each of their colors'
}

/** Tokens a list's Cards make. */
export const deckTokens = {
  title: 'Tokens',
  none: 'No Cards here create Tokens, emblems or helpers.',
  unavailable: 'Token data unavailable (Scryfall).',
  madeBy: (token: string, makers: string) => `${token}\nMade by: ${makers}`,
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
  manaValue: (value: string) => `Mana value ${value} ×`,
  clear: 'Clear filters'
}
