import { COLOR_NAMES, type ColorFilter } from '@shared/cards'
import { commanderRule, type DeckFormat } from '@shared/formats'
import { MANA_SYMBOLS } from '../lib/artwork'
import type { ListPriority } from '@shared/listPriority'
import { FormatSelect } from './Controls'
import { Icon } from './Icon'
import { MenuButton } from './MenuButton'

/** Props of {@link ListHeader}. */
interface ListHeaderProps {
  name: string
  /** Art crop of the commander: the header becomes an art banner. Null for a plain header. */
  art: string | null
  /** The commander, named under the title. */
  leader: string | null
  /** The commander's color identity, as mana symbols. */
  colors: ColorFilter[]
  /** Noun used in labels. */
  noun: 'deck' | 'list'
  format: DeckFormat | null
  /** Commander picking mode active. */
  picking: boolean
  /** The list has a commander. */
  hasCommander: boolean
  /** Some card can lead the list, or the commander can be removed. */
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

/**
 * List title bar: format select, commander picking, problem badges and list actions. With the
 * commander's art it is a banner: the art behind the title, darkened toward the text.
 */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, legalityErrors, ownershipErrors, onlyProblems, art, leader, colors } = props
  const { picking, hasCommander, canPickCommander } = props
  const problemsTitle = onlyProblems ? 'Show all cards' : 'Show only cards with problems'
  return (
    <header className={`view-header${art ? ' art-hero' : ''}`}>
      {art && <img className="hero-art" src={art} alt="" draggable={false} />}
      <div className="header-title">
        <h1>{name}</h1>
        {leader && (
          <p className="hero-leader">
            Led by <strong>{leader}</strong>
          </p>
        )}
        <div className="header-meta">
          {colors.length > 0 && (
            <span className="header-colors" aria-label={`Colors: ${colors.map((color) => COLOR_NAMES[color]).join(', ')}`}>
              {colors.map((color) => (
                <img key={color} src={MANA_SYMBOLS[color]} alt="" draggable={false} />
              ))}
            </span>
          )}
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
                  : `Then click the card that leads this ${noun}. In ${format.label} it must be ${commanderRule(format)}.${hasCommander ? ' Click your commander to remove it.' : ''}`
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
              className={`chip short issue-badge${onlyProblems ? ' on' : ''}`}
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
