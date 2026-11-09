import { useMemo } from 'react'
import {
  bracketFacts,
  bracketFloor,
  cardBreaks,
  deckSalt,
  floorLabel,
  saltVersus,
  timeCombo,
  type BracketFacts,
  type BracketLevel,
  type BracketRule,
  type DeckSalt
} from '@shared/brackets'
import { nameKey } from '@shared/decklist'
import type { DeckFormat } from '@shared/formats'
import { manaBase, manaTurn } from '@shared/manaBase'
import type { Row } from '../lib/summary'
import { useAverageCards } from '../stores/averageDecks'
import { useBracketCards, useBracketCombos } from '../stores/brackets'

/** What a Card row shows about brackets, beyond the Game Changer mark. */
export interface BracketMarks {
  combo?: 'early' | 'late'
  extraTurn?: true
  landDenial?: true
  /** The rule it breaks at the declared bracket. */
  above?: { level: BracketLevel; reason: BracketRule }
}

/** A Deck's bracket: what its Cards say, against what it declares. */
export interface DeckBracket {
  facts: BracketFacts
  floor: BracketLevel
  /** The floor as shown: `3`, `4–5`, `2+`. */
  label: string
  declared: BracketLevel | null
  /** The Cards fit the declared bracket, or none is declared. */
  fits: boolean
  /** Combos are being looked up. */
  checking: boolean
  /** Scryfall's tags are on their way. */
  tagsLoading: boolean
  /** EDHREC's salt is on its way. */
  saltLoading: boolean
  /** Asks Commander Spellbook again, after a miss. */
  retry: () => void
  salt: DeckSalt | null
  /** Its salt against EDHREC's average deck for its commanders, card for card; null when unknown. */
  saltVsAverage: { percent: number; level: number | null; commanders: string[] } | null
  /** Marks by nameKey. */
  marks: Map<string, BracketMarks>
}

/**
 * @param rows - The main deck, commanders and Companion included.
 * @param leaders - The commanders' names.
 * @param format - The shown Version's format; nothing is fetched unless it has brackets.
 * @returns The Deck's bracket; null outside formats with brackets.
 */
export function useDeckBracket(
  rows: Row[],
  leaders: string[],
  format: DeckFormat | null,
  declared: BracketLevel | null,
  detailed: boolean
): DeckBracket | null {
  const enabled = !!format?.commander?.brackets
  const { data, tagsLoading, saltLoading } = useBracketCards(enabled, enabled && detailed)
  const leaderKeys = new Set(leaders.map(nameKey))
  const others = rows.filter((row) => !leaderKeys.has(nameKey(row.line.name))).map((row) => row.line.name)
  const { combos, retry } = useBracketCombos(leaders, enabled && rows.length > 0 ? others : null)
  const average = useAverageCards(enabled && detailed ? leaders : [], declared)

  return useMemo(() => {
    if (!enabled) return null
    const timed =
      combos &&
      (() => {
        const base = manaBase(
          rows.map((row) => ({ line: row.line, info: row.info, leader: leaderKeys.has(nameKey(row.line.name)) })),
          format,
          null
        )
        const manaValues = new Map(rows.map((row) => [nameKey(row.line.name), row.info?.manaValue ?? null]))
        return combos.map((combo) =>
          timeCombo(combo, (name) => manaValues.get(nameKey(name)) ?? null, (mana) => manaTurn(base, mana, format?.players === 2))
        )
      })()
    const facts = bracketFacts(
      rows.map((row) => ({ name: row.line.name, gameChanger: !!row.info?.gameChanger })),
      data,
      timed ?? null
    )
    const floor = bracketFloor(facts)
    const marks = new Map<string, BracketMarks>()
    const mark = (name: string, patch: BracketMarks) => marks.set(nameKey(name), { ...marks.get(nameKey(name)), ...patch })
    for (const combo of facts.combos ?? []) for (const piece of combo.pieces) if (marks.get(nameKey(piece.name))?.combo !== 'early') mark(piece.name, { combo: combo.early ? 'early' : 'late' })
    for (const name of facts.extraTurns) mark(name, { extraTurn: true })
    for (const name of facts.landDenial) mark(name, { landDenial: true })
    if (declared !== null) {
      for (const row of rows) {
        const reason = cardBreaks(facts, row.line.name, declared)
        if (reason) mark(row.line.name, { above: { level: declared, reason } })
      }
    }
    const salt = deckSalt(
      rows.flatMap((row) => Array<string>(row.line.qty).fill(row.line.name)),
      data.salt
    )
    return {
      facts,
      floor,
      label: floorLabel(floor, facts.combos !== null && facts.tagged),
      declared,
      fits: declared === null || declared >= floor,
      checking: combos === undefined,
      tagsLoading,
      saltLoading,
      retry,
      salt,
      saltVsAverage: (() => {
        const other = average && deckSalt(average.names, data.salt)
        const percent = salt && other ? saltVersus(salt, other) : null
        return percent === null ? null : { percent, level: average!.level, commanders: leaders }
      })(),
      marks
    }
    // The row list is rebuilt with the list; its names and card data are what matter.
  }, [enabled, rows, combos, data, tagsLoading, saltLoading, declared, format, average, leaders.join('\n')])
}
