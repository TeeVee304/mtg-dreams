import { listHeader } from './decklist'
import { listColor, withColor } from './listColor'
import { withPriority } from './listPriority'
import { isUnbuilt, withUnbuilt } from './listUnbuilt'
import type { ListKind, ListLine } from './types'

/** Upgrade header line stored in a wishlist file: `// Upgrade of: <deck name>`. */
const UPGRADE = listHeader('Upgrade of', 'upgrade\\s+of')

/** @returns Deck name of the first upgrade header; null if none. */
export function upgradeOf(lines: ListLine[]): string | null {
  return UPGRADE.read(lines)
}

/**
 * Replaces the upgrade header, placing it first.
 * @param deck - Deck name; null removes the header.
 */
export function withUpgradeOf(lines: ListLine[], deck: string | null): ListLine[] {
  return UPGRADE.write(lines, deck)
}

/** Deck names match case-insensitively, as list file names do. */
export const sameDeckName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/**
 * The deck a wishlist upgrades: the whole deck as it will be, sharing that deck's copies.
 * @returns The deck among `lists`; null for decks, plain wishlists and upgrades of decks that no longer exist.
 */
export function upgradeTarget<L extends { kind: ListKind; name: string }>(
  list: { kind: ListKind; lines: ListLine[] },
  lists: L[]
): L | null {
  if (list.kind !== 'wishlist') return null
  const name = upgradeOf(list.lines)
  return name === null ? null : (lists.find((other) => other.kind === 'deck' && sameDeckName(other.name, name)) ?? null)
}

/**
 * @param upgrade - Lines of a complete upgrade.
 * @param deck - Lines of the deck it upgrades.
 * @returns The deck's new lines: the upgrade's, without its wishlist headers, in the deck's color if it
 * has one, and unbuilt if the deck was.
 */
export function appliedUpgrade(upgrade: ListLine[], deck: ListLine[]): ListLine[] {
  const lines = withUnbuilt(withPriority(withUpgradeOf(upgrade, null), 'normal'), isUnbuilt(deck))
  const color = listColor(deck)
  return color ? withColor(lines, color) : lines
}
