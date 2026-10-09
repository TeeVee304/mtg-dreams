import { isBasicLand } from '../cards'
import { BRACKETS, engineChoice, STRATEGIES, winconChoice, type DeckBrief } from './deckBrief'
import type { DeckPick } from './deckDraft'
import { nameKey, parseList, serializeList } from '../decklist'
import { slotInfo } from './deckTemplate'
import { withCommander, withFormat } from '../formats'

/**
 * A deck from the Deck Wizard as a Commander wishlist: the format and commander headers, the
 * commander and the 99 (spells first, then lands), and at the end, as comments the list format
 * keeps through edits, how the deck plays and why each card is in it.
 *
 * @packageDocumentation
 */

/** Width comment lines wrap at. */
const WRAP = 100

/** Wraps text into comment lines. */
function comment(text: string, indent = ''): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (line && line.length + word.length + 1 > WRAP) {
      lines.push(`// ${line}`)
      line = indent + word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(`// ${line}`)
  return lines
}

/** @returns The wishlist file text for a built deck. */
export function wishlistText(
  brief: Pick<DeckBrief, 'commander' | 'bracket' | 'strategy' | 'wincons' | 'engines'>,
  deck: { picks: DeckPick[]; summary: string; notes: string[] }
): string {
  const commander = nameKey(brief.commander)
  const picks = deck.picks.filter((pick) => nameKey(pick.name) !== commander)
  const spells = picks.filter((pick) => pick.slot !== 'land')
  const lands = picks.filter((pick) => pick.slot === 'land')
  const cards = [`1 ${brief.commander}`, ...[...spells, ...lands].map((pick) => `${pick.qty} ${pick.name}`)]
  const plan = [
    `Bracket ${brief.bracket} · ${BRACKETS[brief.bracket].label}`,
    brief.strategy && STRATEGIES[brief.strategy].label,
    ...brief.wincons.map((wincon) => winconChoice(wincon).label),
    ...brief.engines.map((engine) => engineChoice(engine).label)
  ].filter(Boolean)
  const notes = ['', `// Built with the Deck Wizard: ${plan.join(', ')}.`]
  if (deck.summary) notes.push('// How this deck plays:', ...comment(deck.summary))
  for (const note of deck.notes) notes.push(...comment(`Note: ${note}`, '  '))
  notes.push('// Why each card is here:')
  for (const pick of [...spells, ...lands].filter((p) => !isBasicLand(p.name))) {
    notes.push(...comment(`${pick.name} (${slotInfo(pick.slot).label}): ${pick.reason}`, '  '))
  }
  const lines = withCommander(withFormat(parseList([...cards, ...notes].join('\n')), 'commander'), brief.commander)
  return serializeList(lines)
}
