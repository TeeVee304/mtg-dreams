import { useMemo } from 'react'
import { nameKey } from '@shared/decklist'
import { listCommanders } from '@shared/formats'
import {
  activeVariant,
  BASE,
  findVariant,
  listVariants,
  variantFor,
  variantSwaps,
  versionCardLines,
  type ListVersion
} from '@shared/listVersion'
import { sumOf } from '@shared/totals'
import { cutChoices } from '../lib/cutChoices'
import { versionList } from '../lib/summary'
import type { CardList } from '../stores/library'
import type { SearchChoice } from '../components/CardSearch'
import { useStoredValue } from './useStoredValue'

/** Type guard for a stored {@link ListVersion}: any name (one the list no longer has shows the list itself). */
const isVersion = (value: string): value is ListVersion => typeof value === 'string' && value !== ''

/**
 * The version of a list its page shows (the list itself, Duel for Commander, EDH for Duel, or a named
 * one), remembered per list, with what that version is made of.
 */
export function useListVersion(list: CardList) {
  const variants = listVariants(list.lines)
  const [storedVersion, setVersion] = useStoredValue<ListVersion>(`mtg-dreams.version.${list.kind}/${list.name}`, BASE, isVersion)
  /** The version shown, when the list still has it. */
  const other = findVariant(list.lines, storedVersion)
  const version: ListVersion = other?.label ?? BASE
  /** The other-format version the list's format allows, while it doesn't have it yet. */
  const formatVariant = activeVariant(list.lines) ? null : variantFor(list.lines)
  /** The version shown, as a list: rows, rules, stats and copying all follow it. */
  const shown = versionList(list, version)
  const swaps = other ? variantSwaps(list.lines, version) : { ins: [], outs: [] }
  const swapsQty = sumOf([...swaps.ins, ...swaps.outs], (line) => line.qty)
  /** Cards the version can cut: the list's it still plays, but the commanders and its own cards in. */
  const outChoices = useMemo<SearchChoice[]>(() => {
    if (version === BASE) return []
    const ins = new Set(variantSwaps(list.lines, version).ins.map((line) => nameKey(line.name)))
    const leaders = new Set(listCommanders(list.lines).map(nameKey))
    return cutChoices(versionCardLines(list.lines, version), (key) => !ins.has(key) && !leaders.has(key))
  }, [list.lines, version])
  return { variants, other, version, setVersion, formatVariant, shown, swaps, swapsQty, outChoices }
}
