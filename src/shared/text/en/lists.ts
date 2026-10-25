import { count } from './terms'

/** Lists moving between Decks, Wishlists and Brews. */
export const moves = {
  toDeck: (name: string) => `“${name}” is now a Deck`,
  toWishlist: (name: string) => `“${name}” is now a Wishlist`,
  toWishlistBottom: (name: string) => `“${name}” is now a Wishlist, at the bottom of your Wishlists`,
  toBrew: (name: string) => `“${name}” is now a Brew: it no longer counts in Most Wanted`
}

/** A list's page: header, figures, adding Cards, the table and its messages. */
export const list = {
  header: {
    showAll: 'Show all Cards',
    showProblems: 'Show only Cards with problems',
    colors: 'Colors',
    identity: (name: string, colors: string) => `${name}: ${colors}`,
    brew: 'Brew',
    brewHint: 'An idea: it counts toward nothing, not even Most Wanted',
    upgradeOf: 'Upgrade of…',
    unbuilt: 'Unbuilt',
    addFormatVersion: (version: string) => `Add ${version} Version`,
    addVersion: 'Add Version…',
    renameVersion: (version: string) => `Rename ${version} Version…`,
    background: 'Background',
    backgroundHint: (name: string) => `Background: ${name}`,
    versionBadge: (version: string) => `${version} Version`,
    themes: 'Popular Themes on EDHREC',
    themeHint: (commanders: string) => `Popular with ${commanders} on EDHREC`,
    version: 'Version',
    baseHint: (noun: string) => `The ${noun} itself`,
    variantHint: (version: string, noun: string) => `Its ${version} Version: the same ${noun} with its ${version} swaps`,
    cancelPicking: 'Cancel (Esc)',
    pickHint: (noun: string, format: string, rule: string, hasCommander: boolean) =>
      `Then click the Card that leads this ${noun}. In ${format} it must be ${rule}.${hasCommander ? ' Click a Commander to remove it.' : ''}`,
    picking: 'Click your Commander… (Esc to cancel)',
    setCommander: 'Set Commander',
    partnerKinds: { Partner: 'Partner', Background: 'Background' },
    joinHint: (leader: string) => `Then click the Card that joins ${leader} as your second Commander.`,
    joinFirst: (leader: string, noun: string) => `Add a Card that can join ${leader} to this ${noun} first.`,
    pickingPartner: (kind: string) => `Click a ${kind}… (Esc to cancel)`,
    addPartner: (kind: string) => `Add ${kind}`,
    breaksRules: (n: number, format: string) => `${n} ${n === 1 ? 'Card breaks' : 'Cards break'} ${format} rules`,
    needsCopies: (n: number) => `${n} ${n === 1 ? 'Card needs' : 'Cards need'} more Copies`,
    makeWishlist: 'Make it a Wishlist',
    editAsText: 'Edit as text',
    more: (noun: string) => `More ${noun} actions`,
    changeCommander: 'Change Commander',
    color: 'Color',
    format: 'Format',
    advanced: 'Advanced',
    rename: 'Rename',
    deleteVersion: (version: string) => `Delete ${version} Version`,
    delete: 'Delete'
  },
  figures: {
    makeup: (lands: number, nonland: number) => `${lands} Lands · ${nonland} nonland`,
    sideboard: (n: number) => `${n} Sideboard`,
    cost: 'Cost',
    deckValue: 'Deck value',
    cards: 'Cards',
    ofCards: (cards: number, target: number) => `${cards} of ${target} Cards`,
    toBuild: 'To build it',
    stillNeeded: 'Still needed',
    youOwn: 'You own',
    collected: 'Collected',
    ownedValue: (owned: string, total: string) => `${owned} owned of ${total}`,
    percentCollected: (percent: number) => `${percent}% collected`,
    prices: (basis: string) => `${basis} prices`,
    loading: (n: number) => `${n} loading`,
    unpriced: (n: number) => `${n} without price`
  },
  add: {
    ownedHint: (owned: number, inOtherDecks: number) => (inOtherDecks > 0 ? `${owned} owned, ${inOtherDecks} in other Decks` : `${owned} owned`),
    full: (limit: string, noun: string, inList: number) => `${limit}, and this ${noun} already has ${inList}.`,
    addedOne: (card: string) => `Added 1× ${card}`,
    free: (free: number, owned: number) => `${free} of your ${owned} free`,
    youOwn: (n: number) => `You own ${n}`,
    alreadyIn: (n: number, noun: string) => `${n} already in this ${noun}`,
    formatMax: (format: string, max: number) => `${format}: max ${max}`,
    addTo: (isDeck: boolean) => (isDeck ? 'Add to Deck' : 'Add to list'),
    added: (qty: number, card: string, sideboard: boolean) => `Added ${qty}× ${card}${sideboard ? ' to the Sideboard' : ''}`,
    searchInventory: 'Add a Card from your Inventory…  (Ctrl+K)',
    searchAny: 'Add a Card to this list…  (Ctrl+K)',
    addPrecon: 'Add Precon…',
    inTheDeck: (n: number) => `${n} in the Deck`
  },
  table: {
    views: {
      table: { label: 'Table', title: 'Cards as table rows' },
      grid: { label: 'Cards', title: 'Cards as images' }
    },
    view: 'View',
    filterByName: 'Filter by name…',
    stillLoading: 'Some Cards are still loading and are hidden by these filters.',
    hideOwned: 'Hide Owned',
    showing: (shown: number, total: string, figure: string) => `Showing ${shown} of ${total} · ${figure}`,
    value: (value: string) => `${value} value`,
    stillNeeded: (value: string) => `${value} still needed`,
    columns: { owned: 'Owned', qty: 'Qty', wanted: 'Wanted', card: 'Card', version: 'Version', price: 'Price', actions: 'Actions' },
    ownedHint: 'Copies you own, shared by all lists through the Inventory',
    priceHint: 'Sorts by unit price',
    noMatch: 'No Cards match the current filters.',
    fold: (section: string) => `Fold ${section}`,
    show: (section: string) => `Show ${section}`
  },
  complete: {
    title: (upgrade: boolean, brew: boolean) => (upgrade ? 'Upgrade complete!' : brew ? 'Brew complete!' : 'Wishlist complete!'),
    ownAll: (cards: string) => `You own all ${cards}.`,
    next: (upgrades: string | null) => (upgrades ? `Ready to apply it to “${upgrades}”?` : 'Ready to become a Deck?'),
    applying: 'Applying…',
    apply: 'Apply upgrade',
    moving: 'Moving…',
    move: 'Move to Decks'
  },
  commanderCut: 'Commanders lead every Version. Change them with “Change Commander”.',
  versionAdded: (list: string, version: string) => `“${list}” has a ${version} Version, identical until you change it`,
  notMoved: 'Not moved',
  unbuilt: (list: string) => `“${list}” is now unbuilt: it uses your Cards without reserving them`,
  built: (list: string) => `“${list}” is built again: it reserves its Cards`,
  upgraded: (deck: string, list: string) => `Upgraded “${deck}”; “${list}” went to the Recycle Bin`,
  upgradeFailed: (error: string) => `Could not apply the upgrade: ${error}`,
  versionCopied: (version: string) => `${version} Version copied to clipboard`,
  copied: (isDeck: boolean) => `${isDeck ? 'Deck' : 'List'} copied to clipboard`,
  brewNote: 'A Brew will not add Cards to Most Wanted nor Trades.',
  fullList: (version: string) => `Full ${version} List`,
  empty: (noun: string) => `This ${noun} is empty.`,
  emptyDeckHint: 'Search your Inventory above to add Cards, or use Edit as text to paste a decklist.',
  emptyListHint: 'Search for a Card above, add a Precon, or use Edit as text to paste a whole list.',
  /** Picking Commanders. */
  sharesCommand: (card: string, leader: string) => `${card} now shares command with ${leader}`,
  noLongerCommander: (card: string, alone: string | null) => `${card} is no longer your Commander${alone ? `; ${alone} leads alone` : ''}`,
  nowLeads: (card: string, noun: string) => `${card} now leads this ${noun}`
}

/** A list's dialogs: renaming, deleting, editing as text, Versions, upgrades. */
export const listDialogs = {
  rename: (noun: string) => `Rename ${noun}`,
  name: 'Name',
  renameConfirm: 'Rename',
  delete: (noun: string) => `Delete ${noun}`,
  deleteMessage: (list: string, isDeck: boolean) =>
    `Move “${list}” to the Recycle Bin? ${isDeck ? 'Its Cards stay in your Inventory.' : 'Your Inventory is not affected.'}`,
  deleteConfirm: 'Delete',
  deleted: (list: string) => `Deleted ${list}`,
  editVersion: (version: string, list: string) => `Edit the ${version} Version of “${list}” as text`,
  edit: (list: string) => `Edit “${list}” as text`,
  moved: (card: string, toSideboard: boolean) => `Moved ${card} to the ${toSideboard ? 'Sideboard' : 'main Deck'}`,
  addedFrom: (cards: number, deck: string, skipped: number, format: string | null) =>
    `Added ${count.cards(cards)} from ${deck}${skipped > 0 ? ` · skipped ${skipped} extra ${count.copyWord(skipped)} (${format} limit)` : ''}`,
  unown: {
    title: 'Update Inventory',
    message: (qty: number, card: string, target: number) =>
      `You have ${qty}× ${card} in your Inventory. ${target === 0 ? 'Remove all of them?' : `Reduce it to ${target}?`} Other Wishlists using it lose those Copies too.`,
    confirm: (target: number) => (target === 0 ? 'Remove all' : `Reduce to ${target}`)
  },
  color: (isDeck: boolean) => `${isDeck ? 'Deck' : 'List'} color`,
  deleteVersion: {
    title: (version: string) => `Delete the ${version} Version?`,
    message: (swaps: number, base: string) => `Its ${count.swaps(swaps)} will be deleted. The ${base} Version stays as it is.`,
    confirm: (version: string) => `Delete ${version} Version`
  },
  versionName: {
    rename: (version: string) => `Rename the ${version} Version`,
    add: 'Add a Version',
    label: 'Name, e.g. “Counters” or “Artifacts”',
    addConfirm: 'Add Version'
  },
  changeFormat: {
    title: (format: string) => `Change the Format to ${format}?`,
    message: (version: string, base: string, noun: string, swaps: number) =>
      `${version} Versions belong to ${base} ${noun}s. This ${noun}’s ${version} Version and its ${count.swaps(swaps)} will be deleted.`,
    confirm: 'Change and delete'
  },
  upgrade: {
    title: 'Upgrade of…',
    upgradeOf: (list: string, deck: string, version: string | null) => `“${list}” is now an upgrade of ${deck}${version ? `’s ${version} Version` : ''}`,
    plain: (list: string) => `“${list}” is a plain Wishlist again`,
    hint: 'Make this list the whole Deck as you want it to be after an upgrade. It uses the Deck’s Copies of the Cards they share, so it only needs Copies of its own for the rest. Once you own every Card, you can apply it to the Deck.',
    deck: 'Deck',
    none: 'None: a plain Wishlist',
    noDecks: 'You have no Decks yet.'
  }
}
