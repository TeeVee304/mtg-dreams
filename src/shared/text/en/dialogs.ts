import { counted } from '../../plural'
import type { ListKind } from '../../types'
import { count, terms } from './terms'

/** Dialog buttons, the text editor, new lists and save conflicts. */
export const dialogs = {
  cancel: 'Cancel',
  save: 'Save',
  name: 'Name',
  format: 'Format',
  conflict: {
    title: 'Changed somewhere else',
    keepMine: 'Keep mine',
    loadOther: 'Load the other Version',
    body: (name: string) =>
      `${name} was changed outside MTG Dreams, maybe synced from another computer, so your latest change here wasn't saved.`,
    loadOtherHint: "shows what's in the file now, without your latest changes.",
    keepMineHint: 'saves your Version over the other one.'
  },
  editor: {
    placeholder: 'Paste a Goldfish / Arena / Moxfield list here, e.g.\n4 Lightning Bolt\n1 Sol Ring [CMM]',
    syntax: 'One Card per line: “4 Lightning Bolt”. Optional Version: “4 Lightning Bolt <141> [A25]”, foil: “(F)”.',
    /** The live summary under the editor: `12 Cards · 10 lines`. */
    stats: (cards: number, unique: number, inventory: boolean) => `${count.cards(cards)} · ${unique} ${inventory ? 'unique names' : 'lines'}`,
    unrecognized: (n: number, kept: boolean, first: string, more: boolean) =>
      `${counted(n, 'unrecognised line')} (${kept ? 'kept as-is' : 'will be dropped'}): “${first}”${more ? '…' : ''}`
  },
  newList: {
    title: (kind: ListKind) => `New ${terms.kinds[kind]}`,
    create: (kind: ListKind) => `Create ${terms.kinds[kind]}`,
    namePlaceholder: { deck: 'e.g. Atraxa superfriends', wishlist: 'e.g. Atraxa upgrades', brew: 'e.g. Atraxa infect, someday' } satisfies Record<ListKind, string>,
    importDeck: 'Import a decklist (optional)',
    importCards: 'Import Cards (optional)',
    addToInventory: "Add these Cards to my Inventory if they're missing (Decks can only use Cards you own)",
    or: 'Or',
    orLower: 'or',
    fromPrecon: 'start from an official Precon…',
    wizard: 'let the Deck Wizard plan a Commander Deck…'
  },
  created: {
    deck: (name: string, cards: number) => `Created Deck “${name}” and added its ${count.cards(cards)} to your Inventory`,
    list: (name: string, cards: number) => `Created “${name}” with ${count.cards(cards)}`,
    brew: (name: string, cards: number) => `Created Brew “${name}” with ${count.cards(cards)}: make it a Wishlist once you want it`,
    kind: (kind: ListKind, name: string, cards: number) => `Created ${terms.kinds[kind]} “${name}” with ${count.cards(cards)}`
  },
  dataFolderChanged: 'Data folder changed',
  importedTrade: (friend: string, haves: number, wants: number) =>
    `Imported ${friend}'s Trade list: ${count.cards(haves)} they have, ${count.cards(wants)} they want`
}
