import { commanderRule, type DeckFormat, type DeckSizeCheck } from '@shared/formats'
import type { ListPriority } from '@shared/listPriority'
import { cardCount, formatDate } from '../lib/format'
import type { Summary } from '../lib/summary'
import { FormatSelect } from './Controls'
import { Icon } from './Icon'
import { MenuButton } from './MenuButton'

/** Props of {@link ListHeader}. */
interface ListHeaderProps {
  name: string
  /** Noun used in labels. */
  noun: 'deck' | 'list'
  format: DeckFormat | null
  /** Card line count (not copies). */
  lines: number
  summary: Summary
  /** Main deck copies (sideboard aside). */
  mainCards: number
  /** Sideboard copies. */
  sideboardCards: number
  /** Decks with a format: main deck size against it. */
  size: DeckSizeCheck | null
  /** Commander picking mode active. */
  picking: boolean
  /** The list has a commander. */
  hasCommander: boolean
  /** Some card other than the commander can lead the list. */
  canPickCommander: boolean
  legalityErrors: number
  ownershipErrors: number
  /** Copies are separate per list: shortfalls may be copies other decks use. */
  separateCopies: boolean
  /** Problem-only filter active. */
  onlyProblems: boolean
  onToggleProblems: () => void
  onTogglePicking: () => void
  onFormat: (formatId: string | null) => void
  onEditText: () => void
  /** Copies the list text to the clipboard. */
  onCopy: () => void
  /** Opens the color picker. */
  onColor: () => void
  /** Wishlists: current priority. */
  priority?: ListPriority
  /** Wishlists: opens the priority picker. */
  onPriority?: () => void
  onRename: () => void
  onDelete: () => void
}

/** List title bar: format select, commander picking, problem badges, price status and list actions. */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, lines, summary, legalityErrors, ownershipErrors, onlyProblems } = props
  const { picking, hasCommander, canPickCommander } = props
  const problemsTitle = onlyProblems ? 'Show all cards' : 'Show only cards with problems'
  return (
    <header className="view-header">
      <div>
        <h1>{name}</h1>
        <div className="header-meta">
          <label className="field-inline format-field">
            Format
            <FormatSelect value={format?.id ?? ''} onChange={(id) => props.onFormat(id || null)} label="Deck format" />
          </label>
          {format?.commander && (picking || canPickCommander) && (
            <button
              type="button"
              className={`wand-btn${picking ? ' on' : ''}`}
              onClick={props.onTogglePicking}
              aria-pressed={picking}
              title={
                picking
                  ? 'Cancel (Esc)'
                  : `Then click the card that leads this ${noun}. In ${format.label} it must be ${commanderRule(format)}.`
              }
            >
              <Icon name="wand" />
              {picking ? 'Click your commander… (Esc to cancel)' : hasCommander ? 'Change commander' : 'Set commander'}
            </button>
          )}
          {legalityErrors > 0 && (
            <button
              type="button"
              className={`chip illegal issue-badge${onlyProblems ? ' on' : ''}`}
              onClick={props.onToggleProblems}
              title={problemsTitle}
            >
              {legalityErrors} {legalityErrors === 1 ? 'card breaks' : 'cards break'} {format?.label} rules
            </button>
          )}
          {ownershipErrors > 0 && (
            <button
              type="button"
              className={`chip illegal issue-badge${onlyProblems ? ' on' : ''}`}
              onClick={props.onToggleProblems}
              title={problemsTitle}
            >
              {ownershipErrors}{' '}
              {props.separateCopies
                ? `${ownershipErrors === 1 ? 'card needs' : 'cards need'} more copies`
                : `${ownershipErrors === 1 ? 'card is' : 'cards are'} not in your inventory`}
            </button>
          )}
          {props.priority && props.priority !== 'normal' && (
            <button
              type="button"
              className={`chip priority-chip ${props.priority}`}
              onClick={props.onPriority}
              title={props.separateCopies ? 'How much this list counts in Most Wanted, and its turn for your copies' : 'How much this list counts in Most Wanted'}
            >
              {props.priority === 'high' ? '★ High priority' : 'Low priority'}
            </button>
          )}
          <span className="muted">
            {props.size ? (
              <span className={props.size.status === 'ok' ? undefined : 'warn'} title={props.size.note ?? undefined}>
                {props.size.label} cards
              </span>
            ) : (
              cardCount(props.mainCards)
            )}
            {props.sideboardCards > 0 && ` + ${props.sideboardCards} sideboard`} ·{' '}
            {summary.loading > 0
              ? `loading prices ${lines - summary.loading}/${lines}…`
              : summary.pricedAt
                ? `prices from ${formatDate(summary.pricedAt)}`
                : 'no prices yet'}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <button type="button" onClick={props.onEditText}>
          Edit as text
        </button>
        <MenuButton
          label={`More ${noun} actions`}
          items={[
            { label: 'Copy as text', onSelect: props.onCopy },
            { label: 'Color…', onSelect: props.onColor },
            ...(props.onPriority ? [{ label: 'Priority…', onSelect: props.onPriority }] : []),
            { label: 'Rename…', onSelect: props.onRename },
            { label: `Delete ${noun}…`, onSelect: props.onDelete, danger: true }
          ]}
        />
      </div>
    </header>
  )
}
