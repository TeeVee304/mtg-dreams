import { count } from './terms'

/** Format rules, ownership and list sections: why a Card is flagged, and how a list is split. */
export const rules = {
  /** What can lead a Deck in a format, for messages: `it must be a planeswalker`. */
  commanderRule: {
    legendary: 'a legendary creature or Vehicle',
    legendaryOrPlaneswalker: 'a legendary creature, Vehicle or planeswalker',
    planeswalker: 'a planeswalker',
    uncommonCreature: 'a creature printed at uncommon'
  },
  // Each problem has a short chip text, and its full reason, shown on hover and in the Card dialog.
  oneCommander: 'One Commander',
  oneCommanderIn: (format: string) => `${format} has one Commander`,
  cantShareCommand: "Can't Partner",
  cantShareCommandWith: (partner: string) => `Can't share command with ${partner}`,
  cantLead: "Can't lead",
  cantLeadIn: (format: string, rule: string) => `Can't be your Commander in ${format}: it must be ${rule}`,
  banned: 'Banned',
  bannedIn: (format: string) => `Banned in ${format}`,
  notLegal: 'Not legal',
  notLegalIn: (format: string) => `Not legal in ${format}`,
  /** A Rulebreaker commander: allowed to lead, with a warning. */
  playtest: (format: string) => `Not legal in ${format}: Rulebreakers are playtest Cards`,
  restricted: 'Restricted',
  restrictedIn: (format: string) => `Restricted in ${format}`,
  restrictedOver: (format: string) => `Restricted in ${format}: max 1 Copy`,
  maxCopies: (max: number) => `Max ${count.copies(max)}`,
  maxCopiesIn: (max: number, format: string) => `${format} allows ${count.copies(max)} of a Card`,
  maxSideboard: (max: number, format: string) => `Max ${max} in ${format}`,
  outsideColors: 'Outside colors',
  outsideColorsOf: (partners: boolean) => (partners ? "Outside your Commanders' colors" : "Outside your Commander's colors"),
  notCompanion: 'Not a Companion',
  notCompanionDetail: 'Has no Companion ability',
  breaksCompanion: 'Breaks Companion condition',
  breaksCompanionOf: (companion: string, condition: string) => `Breaks ${companion}'s condition: ${condition}`,
  companionShort: 'Deck too small',
  companionShortOf: (companion: string, missing: number) => `${companion} needs ${missing} more Cards in the Deck`,
  unchecked: 'Not checked',
  uncheckedCompanion: (companion: string) => `${companion}'s condition is new to MTG Dreams: it isn't checked`,
  uncheckedRulebreaker: (commander: string) => `${commander}'s Rulebreaker rule is new to MTG Dreams: it isn't applied`,
  /** More problems than the chip shows: `+1`. */
  more: (n: number) => `+${n}`,
  /** Why a Card is allowed despite a rule, on hover and in the Card dialog. */
  allowedBy: (card: string) => `Allowed by ${card}`,
  anyNumber: 'Any number allowed',
  upTo: (n: number) => `Up to ${n} allowed`,
  /** Each Companion's condition, for its problems. */
  companionCondition: {
    even: 'only even mana values',
    odd: 'only odd mana values and Lands',
    symbols: 'no mana symbol twice in a cost',
    creatureTypes: (types: string[]) => `every creature is a ${types.join(', ')}`,
    minManaValue: (min: number) => `only mana value ${min} or more, and Lands`,
    maxPermanentManaValue: (max: number) => `permanents of mana value ${max} or less`,
    singleton: 'each nonland Card named differently',
    sharedType: 'nonland Cards sharing a Card type',
    biggerDeck: (extra: number) => `${extra} Cards over the minimum Deck size`,
    activated: 'permanents with an activated ability'
  },
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
  companion: 'Companion',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard'
}
