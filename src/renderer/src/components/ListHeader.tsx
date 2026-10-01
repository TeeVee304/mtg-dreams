import { commanderRule, FORMATS, type DeckFormat } from '../../../shared/formats'
import { cardCount, formatDay } from '../format'
import type { Summary } from '../summary'
import { Icon } from './Icon'

// A deck's or wishlist's title bar: its format, commander choice, problem badges,
// price status and the actions on the whole list.

interface ListHeaderProps {
  name: string
  noun: 'deck' | 'list'
  format: DeckFormat | null
  /** Card lines in the list (not copies). */
  lines: number
  summary: Summary
  /** Choosing a commander: the next card clicked becomes it. */
  picking: boolean
  hasCommander: boolean
  legalityErrors: number
  ownershipErrors: number
  /** Showing only the cards with problems. */
  onlyProblems: boolean
  onToggleProblems: () => void
  onTogglePicking: () => void
  onFormat: (formatId: string | null) => void
  onRefreshPrices: () => void
  onEditText: () => void
  onCopy: () => void
  onRename: () => void
  onDelete: () => void
}

export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, lines, summary, picking, hasCommander, legalityErrors, ownershipErrors, onlyProblems } = props
  const problemsTitle = onlyProblems ? 'Show all cards' : 'Show only cards with problems'
  return (
    <header className="view-header">
      <div>
        <h1>{name}</h1>
        <div className="header-meta">
          <label className="field-inline format-field">
            Format
            <select
              value={format?.id ?? ''}
              onChange={(event) => props.onFormat(event.target.value || null)}
              aria-label="Deck format"
            >
              <option value="">No format (just a list)</option>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {format?.commander && lines > 0 && (
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
              {picking ? 'Click your Commander… (Esc to cancel)' : hasCommander ? 'Change Commander' : 'Choose Commander'}
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
              {ownershipErrors} {ownershipErrors === 1 ? 'card is' : 'cards are'} not in your inventory
            </button>
          )}
          <span className="muted">
            {cardCount(summary.cards)} ·{' '}
            {summary.loading > 0
              ? `loading prices ${lines - summary.loading}/${lines}…`
              : summary.pricedAt
                ? `Cardmarket prices of ${formatDay(summary.pricedAt)}`
                : 'no prices yet'}
          </span>
        </div>
      </div>
      <div className="header-actions">
        <button type="button" onClick={props.onRefreshPrices} disabled={lines === 0}>
          Refresh prices
        </button>
        <button type="button" onClick={props.onEditText}>
          Edit as text
        </button>
        <button type="button" onClick={props.onCopy}>
          Copy
        </button>
        <button type="button" onClick={props.onRename}>
          Rename
        </button>
        <button type="button" className="danger-ghost" onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </header>
  )
}
