import { listHeader } from './decklist'
import { listColor, withColor } from './listColor'
import { isUnbuilt, withUnbuilt } from './listUnbuilt'
import { BASE, baseCardLines, findVariant, withVariantCards, withVariantOf, type ListVersion } from './listVersion'
import type { ListKind, ListLine } from './types'

/** Upgrade header line stored in a wishlist file: `// Upgrade of: <deck name>`. */
const UPGRADE = listHeader('Upgrade of', 'upgrade\\s+of')

/** Version an upgrade plans, when not the deck itself: `// Upgrade version: Duel` (EDH, or a named version). */
const UPGRADE_VERSION = listHeader('Upgrade version', 'upgrade\\s+version')

/** @returns Deck name of the first upgrade header; null if none. */
export function upgradeOf(lines: ListLine[]): string | null {
  return UPGRADE.read(lines)
}

/** @returns Name of the deck's version an upgrade plans (`Duel`, `Counters`); null for the deck itself. */
export function upgradeVariant(lines: ListLine[]): string | null {
  return UPGRADE_VERSION.read(lines)
}

/** @returns The version of its deck an upgrade plans: one of its versions, or the deck itself (`base`). */
export function upgradeVersion(lines: ListLine[]): ListVersion {
  return upgradeVariant(lines) ?? BASE
}

/**
 * Replaces the upgrade headers, placing them first.
 * @param deck - Deck name; null removes the headers.
 * @param variant - Name of the deck's version the upgrade plans (`Duel`, `Counters`); null for the deck itself.
 */
export function withUpgradeOf(lines: ListLine[], deck: string | null, variant: string | null = null): ListLine[] {
  const versioned = UPGRADE_VERSION.write(lines, deck ? variant : null)
  return UPGRADE.write(versioned, deck)
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
 * @returns The deck's new lines. An upgrade of one of the deck's versions (while it has it) becomes
 * that version's swaps, the deck itself unchanged. Otherwise the deck becomes the upgrade's list,
 * without its wishlist headers, in the deck's color if it has one, unbuilt if the deck was, and with
 * the deck's versions.
 */
export function appliedUpgrade(upgrade: ListLine[], deck: ListLine[]): ListLine[] {
  const own = withUpgradeOf(upgrade, null)
  const version = upgradeVariant(upgrade)
  if (version && findVariant(deck, version)) return withVariantCards(deck, version, baseCardLines(own))
  const lines = withUnbuilt(own, isUnbuilt(deck))
  const color = listColor(deck)
  return withVariantOf(color ? withColor(lines, color) : lines, deck)
}
