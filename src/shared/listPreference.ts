import { isBasicLand } from './cards'
import { listHeader, nameKey } from './decklist'
import { resolveLine, type PickSkips } from './pricing'
import type { SetGroup } from './setGroups'
import type { CardLine, ListLine, PriceBasis, Printing } from './types'

/** Preferred Versions header of a wishlist or brew: `// Preferred Versions: Innistrad`, a set group's name. */
const PREFERRED = listHeader('Preferred Versions', 'preferred\\s+versions')

/**
 * @returns Name of the set group whose Versions a list prefers for the Cards with no Version
 * chosen; null if none.
 */
export function preferredVersions(lines: ListLine[]): string | null {
  return PREFERRED.read(lines)
}

/** Sets the Preferred Versions header, placing it first, or removes it (`null`). */
export function withPreferredVersions(lines: ListLine[], group: string | null): ListLine[] {
  return PREFERRED.write(lines, group)
}

/** A list's Card, as {@link groupCoverage} weighs it. */
export interface CoverageCard {
  line: Pick<CardLine, 'name' | 'qty' | 'set' | 'collector' | 'foil'>
  /** All printings of the Card. */
  printings: Printing[]
  /** Copies of the line you own. */
  owned: number
  /** The line shows the Version you own, which a preference doesn't change. */
  showsOwned: boolean
}

/** What preferring a group would change in a list. */
export interface GroupCoverage {
  group: SetGroup
  /** Cards that would show one of the group's Versions. */
  cards: number
  /** Cards a preference could change: all but basic Lands. */
  total: number
  /** Change in the price of the copies still needed, in euros. */
  change: number
}

/**
 * @param skips - Printings the cheapest Version skips, as the price compared with.
 * @returns Per set group, the Cards that would show one of its Versions and the price change; only
 * groups with some, most first.
 */
export function groupCoverage(cards: CoverageCard[], groups: SetGroup[], basis: PriceBasis, skips: PickSkips = {}): GroupCoverage[] {
  const eligible = cards.filter((card) => !isBasicLand(card.line.name))
  const changeable = eligible.filter((card) => !card.line.set && !card.showsOwned)
  const base = changeable.map((card) => resolveLine(card.line, card.printings, basis, skips).unitPrice)
  return groups
    .map((group) => {
      let count = 0
      let change = 0
      changeable.forEach((card, i) => {
        const preferred = resolveLine(card.line, card.printings, basis, { prefer: group, ...skips })
        if (!preferred.preferred) return
        count += 1
        const was = base[i]
        if (preferred.unitPrice !== null && was !== null) change += Math.max(0, card.line.qty - card.owned) * (preferred.unitPrice - was)
      })
      return { group, cards: count, total: eligible.length, change }
    })
    .filter((coverage) => coverage.cards > 0)
    .sort((a, b) => b.cards - a.cards || a.group.name.localeCompare(b.group.name))
}

/**
 * @param picks - Printing each Card name (by nameKey) shows from the preferred group.
 * @returns Lines with those printings written in, for Cards with no Version chosen: what a copy of
 * the list carries, so a site it's pasted into gets the same Versions.
 */
export function withPreferredPrintings(lines: ListLine[], picks: Map<string, Pick<Printing, 'set' | 'collectorNumber'>>): ListLine[] {
  return lines.map((line) => {
    const pick = line.kind === 'card' && !line.set ? picks.get(nameKey(line.name)) : undefined
    return pick && line.kind === 'card' ? { ...line, set: pick.set, collector: pick.collectorNumber } : line
  })
}
