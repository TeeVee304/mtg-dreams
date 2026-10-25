import { common } from './common'
import { count } from './terms'

/** What each change was, for Undo, and saving and undoing it. */
export const changes = {
  yourInventory: 'Your Inventory',
  aCard: 'a Card',
  /** A list's other-format Version when it has none to name. */
  otherVersion: 'other',
  unreadable: (first: string, more: number) =>
    `Could not read ${first}${more ? ` and ${more} more` : ''}, so ${more ? 'they are' : 'it is'} hidden for now. Close any program using it, then come back to MTG Dreams.`,
  changedSince: 'You changed more since. Press Ctrl+Z to undo step by step.',
  tooLate: 'That change can no longer be undone.',
  nothingToUndo: 'Nothing to undo',
  addedOne: (qty: number, card: string) => `Added ${qty}× ${card}`,
  addedCards: (n: number) => `Added ${n} Cards`,
  commanders: (names: string[]) =>
    names.length === 0 ? 'Removed the Commander' : names.length === 1 ? `Made ${names[0]} the Commander` : `Made ${common.and(names)} the Commanders`,
  removedFromInventory: (card: string) => `Removed ${card} from your Inventory`,
  changedOwned: (card: string) => `Changed how many ${card} you own`,
  changedVersions: (card: string) => `Changed the Versions of ${card} you own`,
  enterName: 'Please enter a name.',
  saveFailed: (error: string) => `Could not save: ${error}`,
  orderFailed: (error: string) => `Could not save the Wishlist order: ${error}`,
  moved: (card: string, toSideboard: boolean) => `Moved ${card} to the ${toSideboard ? 'Sideboard' : 'main Deck'}`,
  changed: (what: string) => `Changed ${what}`,
  removed: (card: string) => `Removed ${card}`,
  addedVersion: (version: string, list: string) => `Added the ${version} Version of ${list}`,
  deletedVersion: (version: string, list: string) => `Deleted the ${version} Version of ${list}`,
  renamedVersion: (version: string, list: string, name: string) => `Renamed the ${version} Version of ${list} to ${name}`,
  edited: (list: string) => `Edited ${list}`,
  changedIn: (card: string, version: string) => `Changed ${card} in the ${version} Version`,
  format: 'Changed the Format',
  color: 'Changed the color',
  unbuilt: (list: string, unbuilt: boolean) => (unbuilt ? `Made ${list} unbuilt` : `Made ${list} built`),
  upgrade: (list: string, deck: string | null) => (deck ? `Made ${list} an upgrade of ${deck}` : `Made ${list} a plain Wishlist`),
  applied: (upgrade: string, deck: string) => `Applied ${upgrade} to ${deck}`,
  addedToInventory: (cards: number) => `Added ${count.cards(cards)} to your Inventory`,
  editedInventory: 'Edited the Inventory'
}
