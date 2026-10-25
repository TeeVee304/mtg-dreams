import { count } from './terms'

/** Format rules, ownership and list sections: why a Card is flagged, and how a list is split. */
export const rules = {
  /** What can lead a Deck in a format, for messages: `it must be a planeswalker`. */
  commanderRule: {
    oathbreaker: 'a planeswalker',
    paupercommander: 'a creature printed at uncommon',
    other: 'a legendary creature or Vehicle'
  },
  oneCommander: (format: string) => `${format} has one Commander`,
  cantShareCommand: (partner: string) => `Can't share command with ${partner}`,
  cantLead: (format: string) => `Can't be your Commander in ${format}`,
  banned: (format: string) => `Banned in ${format}`,
  notLegal: (format: string) => `Not legal in ${format}`,
  restrictedOver: (format: string) => `Restricted in ${format} (max 1)`,
  restricted: (format: string) => `Restricted in ${format}`,
  maxCopies: (max: number, format: string) => `Max ${count.copies(max)} in ${format}`,
  maxSideboard: (max: number, format: string) => `Max ${max} in ${format}`,
  outsideColors: (partners: boolean) => (partners ? "Outside your Commanders' colors" : "Outside your Commander's colors"),
  sizeShort: (missing: number, size: number) => `${missing} short of ${size}`,
  sizeOver: (extra: number, size: number) => `${extra} over ${size}`
}

/** A Deck's Cards you don't own enough of, and where your Copies are. */
export const ownership = {
  notInInventory: 'Not in Inventory',
  onlyFromInventory: 'Decks can only use Cards from your Inventory',
  onlyOwned: (n: number) => `Only ${n} owned`,
  onlyFree: (n: number) => `Only ${n} free`,
  usedBy: (list: string) => `Used by ${list}`,
  usedByOthers: 'Used by other Decks',
  decksAhead: (n: number) => `Decks ahead of this one use ${n}`,
  ownedWhere: (owned: number, where: string) => `You own ${owned} (${where}). Each Copy belongs to one Deck.`,
  /** Where held Copies are: `in Burn` (one), `all in Burn`, `2 in Burn`. */
  heldAll: (owned: number, list: string) => `${owned === 1 ? 'in' : 'all in'} ${list}`,
  heldIn: (qty: number, list: string) => `${qty} in ${list}`,
  heldMore: (named: string, more: number) => `${named} and ${count.moreLists(more)}`,
  formatAllows: (format: string, max: number, card: string) => `${format} allows ${count.copies(max)} of ${card}`,
  ownedElsewhere: (owned: number, card: string, inOtherDecks: number) => `You own ${owned}× ${card}, ${inOtherDecks} in other Decks`,
  owned: (owned: number, card: string) => `You own ${owned}× ${card}`
}

/** A list's sections beyond its type groups. */
export const sections = {
  commander: (n: number) => (n > 1 ? 'Commanders' : 'Commander'),
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard'
}
