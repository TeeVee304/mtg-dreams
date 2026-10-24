/** The app's name, its window and its native menus and dialogs. */
export const app = {
  name: 'MTG Dreams'
}

/** The right-click menu. */
export const contextMenu = {
  copyImage: 'Copy image',
  copyImageAddress: 'Copy image address',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select all'
}

/** Native file dialogs. */
export const fileDialogs = {
  importTrade: 'Import a Trade list',
  tradeFiles: 'Trade lists and Collection exports',
  allFiles: 'All files',
  saveTrade: 'Save my Trade list',
  tradeFile: 'MTG Dreams Trade list',
  chooseDataFolder: 'Choose data folder'
}

/** Printing tags: frame, finish, border, legality and printed name. */
export const printingTags = {
  borderless: 'Borderless',
  showcase: 'Showcase',
  extendedArt: 'Extended art',
  fullArt: 'Full art',
  textless: 'Textless',
  etched: 'Etched',
  serialized: 'Serialized',
  promo: 'Promo',
  whiteBorder: 'White border',
  goldBorder: 'Gold border',
  notLegal: 'Not tournament legal',
  printedAs: (name: string) => `Printed as “${name}”`
}

/** What went wrong, in plain words. */
export const errors = {
  /** An online service (Scryfall, Cardmarket, MTGJSON, EDHREC). */
  slow: (service: string) => `${service} took too long to answer. Try again in a moment.`,
  offline: (service: string) => `Could not reach ${service}. Are you offline?`,
  stalled: (service: string) => `${service} stopped sending data. Try again in a moment.`,
  brokeOff: (service: string) => `The download from ${service} broke off. Try again in a moment.`,
  httpStatus: (status: number) => `HTTP ${status}`,
  http: (service: string, status: number) => `${service} responded with HTTP ${status}.`,
  edhrec: (status: number) => `EDHREC answered with an error (HTTP ${status}). Try again later.`,
  edhrecNoDeck: 'EDHREC sent no Deck.',
  priceGuide: (status: number) => `Cardmarket's price guide is unavailable (HTTP ${status}).`,
  scryfallRateLimit: 'Scryfall rate limit hit; try again in a minute.',
  /** Files. */
  listExists: (kind: string, name: string) => `A ${kind} called "${name}" already exists.`,
  tradeExists: (name: string) => `You already have a Trade list called "${name}".`,
  changedOutside: (file: string) => `"${file}" was changed by another program.`,
  tradeTooBig: 'That file is too big to be a Trade list.',
  notTrade: 'This file is not a valid Trade list.',
  notMtgDreamsTrade: 'This file is not an MTG Dreams Trade list.',
  noCardsInFile: 'No Cards found in this file.',
  noCardsFound: 'No Cards found. Use one Card per line, like “4 Lightning Bolt”.',
  upgradeGone: 'The Deck it upgrades no longer exists.',
  notAnImage: 'Not an image',
  /** Input the app itself sent wrong: a bug, never the player's doing. */
  invalid: (what: string) => `Invalid ${what}.`,
  notText: 'Name must be text.',
  notSetUp: 'The app environment has not been set up yet.'
}
