import { commanderRule, FORMATS, type DeckFormat } from '../../../shared/formats'
import { cardCount, formatDay } from '../format'
import type { Summary } from '../summary'
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
  /** Commander picking mode active. */
  picking: boolean
  legalityErrors: number
  ownershipErrors: number
  /** Problem-only filter active. */
  onlyProblems: boolean
  onToggleProblems: () => void
  onTogglePicking: () => void
  onFormat: (formatId: string | null) => void
  onRefreshPrices: () => void
  onEditText: () => void
  /** Copies the list text to the clipboard. */
  onCopy: () => void
  onRename: () => void
  onDelete: () => void
}

/** List title bar: format select, commander picking, problem badges, price status and list actions. */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, lines, summary, picking, legalityErrors, ownershipErrors, onlyProblems } = props
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
              {picking ? 'Click your Commander… (Esc to cancel)' : 'Set Commander'}
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
        <MenuButton
          label={`More ${noun} actions`}
          items={[
            { label: 'Copy as text', onSelect: props.onCopy },
            { label: 'Rename…', onSelect: props.onRename },
            { label: `Delete ${noun}…`, onSelect: props.onDelete, danger: true }
          ]}
        />
      </div>
    </header>
  )
}
