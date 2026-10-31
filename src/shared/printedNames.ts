import { nameKey } from './decklist'
import { listCommanders, withCommanders } from './formats'
import { finishFor, sortPrintings } from './pricing'
import type { CardLine, ListLine, PriceBasis, PrintingsResult } from './types'

/**
 * Lines named by a flavor name ("Ring of Barahir"): a flavor name belongs to one card, so the line
 * takes that card's name ("Sword of the Animist") and the printing that carries the flavor name.
 *
 * @packageDocumentation
 */

/** A card line to rename, and the printing to pin. */
export interface PrintedNameFix {
  id: string
  /** The flavor name the line has now. */
  from: string
  name: string
  set: string
  collector: string
  foil: boolean
}

/**
 * @param data - The line's card data; its name differs from the line's when the line has a flavor name.
 * @returns The fix for a line named by a flavor name; null otherwise (an exact name, or a near match
 * such as a typo, which the list offers to fix instead).
 */
export function printedNameFix(line: CardLine, data: PrintingsResult | undefined, basis: PriceBasis): PrintedNameFix | null {
  if (!data || data.notFound || nameKey(data.name) === nameKey(line.name)) return null
  const carrying = data.printings.filter((p) => p.flavorName && nameKey(p.flavorName) === nameKey(line.name))
  if (carrying.length === 0) return null
  // The line's own printing if it carries the name, else the cheapest that does.
  const pinned = carrying.find((p) => p.set === line.set && (!line.collector || p.collectorNumber === line.collector))
  const printing = pinned ?? sortPrintings(carrying, line.foil, basis)[0]
  return {
    id: line.id,
    from: line.name,
    name: data.name,
    set: printing.set,
    collector: printing.collectorNumber,
    foil: finishFor(printing, line.foil)
  }
}

/** @returns `lines` with the fixes applied; a commander header naming a fixed line takes the new name too. */
export function withPrintedNames(lines: ListLine[], fixes: PrintedNameFix[]): ListLine[] {
  const byId = new Map(fixes.map((fix) => [fix.id, fix]))
  const fixed = lines.map((line) => {
    const fix = line.kind === 'card' ? byId.get(line.id) : undefined
    return fix ? { ...line, name: fix.name, set: fix.set, collector: fix.collector, foil: fix.foil } : line
  })
  const renamed = listCommanders(lines).map((name) => fixes.find((fix) => nameKey(fix.from) === nameKey(name))?.name ?? name)
  // Commanders under a `Commander` heading are the card lines themselves, already renamed.
  const now = listCommanders(fixed)
  return renamed.every((name, i) => nameKey(name) === nameKey(now[i] ?? '')) ? fixed : withCommanders(fixed, renamed)
}
