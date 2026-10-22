import { COLOR_NAMES, type ColorFilter } from '@shared/cards'
import { colorIdentityName } from '@shared/colorIdentity'
import { commanderRule, type DeckFormat } from '@shared/formats'
import type { ListVersion, Variant } from '@shared/listVersion'
import { MANA_SYMBOLS } from '../lib/artwork'
import { FormatSelect, Segmented } from './Controls'
import { Icon } from './Icon'
import { MenuButton } from './MenuButton'

/** Props of {@link ListHeader}. */
interface ListHeaderProps {
  name: string
  /** Art crop of the commander: the header becomes an art banner. Null for a plain header. */
  art: string | null
  /** The commander, named under the title. */
  leader: string | null
  /** Color identity, as mana symbols named on hover: the commander's, else the cards'. */
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
  /** Wishlists: opens the picker of the deck it upgrades. */
  onUpgrade?: () => void
  /** Decks: whether it is unbuilt, using your cards without reserving them. */
  unbuilt?: boolean
  /** Decks: toggles unbuilt. */
  onToggleUnbuilt?: () => void
  /** The other version the list's format allows (Duel for Commander, EDH for Duel); null for none. */
  variant: Variant | null
  /** Whether the list has that version. */
  variantOn: boolean
  /** The version shown, when the list has its other version; null without one. */
  version: ListVersion | null
  /** Shows a version. */
  onVersion: (version: ListVersion) => void
  /** Adds the other version, or removes it. */
  onToggleVariant?: () => void
  /** Brews: makes it a wishlist; the header then shows it is a brew. */
  onMakeWishlist?: () => void
  onRename: () => void
  onDelete: () => void
}

/**
 * List title bar: format select, commander picking, problem badges and list actions. With the
 * commander's art it is a banner: the art behind the title, darkened toward the text.
 */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, legalityErrors, ownershipErrors, onlyProblems, art, leader, colors } = props
  const colorName = colorIdentityName(colors)
  const { picking, hasCommander, canPickCommander } = props
  const problemsTitle = onlyProblems ? 'Show all cards' : 'Show only cards with problems'
  const { variant } = props
  const other = props.version === 'variant' && variant ? variant : null
  const advanced = [
    ...(props.onUpgrade ? [{ label: 'Upgrade of…', onSelect: props.onUpgrade }] : []),
    ...(props.onToggleUnbuilt ? [{ label: 'Unbuilt', checked: !!props.unbuilt, onSelect: props.onToggleUnbuilt }] : []),
    ...(props.onToggleVariant && variant
      ? [{ label: `${props.variantOn ? 'Remove' : 'Add'} ${variant.label} Version`, onSelect: props.onToggleVariant }]
      : [])
  ]
  return (
    <header className={`view-header${art ? ' art-hero' : ''}${other ? ' variant-view' : ''}`}>
      {art && <img className="hero-art" src={art} alt="" draggable={false} />}
      <div className="header-title">
        {other && <span className="duel-badge">{other.label} version</span>}
        {props.onMakeWishlist && (
          <span className="brew-badge" title="An idea: it counts toward nothing, not even Most Wanted">
            Brew
          </span>
        )}
        <h1>{name}</h1>
        {leader && (
          <p className="hero-leader">
            Led by <strong>{leader}</strong>
          </p>
        )}
        <div className="header-meta">
          {props.version && variant && (
            <Segmented
              label="Version"
              className="version-toggle"
              options={[
                { id: 'base', label: variant.baseLabel, title: `The ${noun} itself, for ${variant.baseLabel} games` },
                { id: 'variant', label: variant.label, title: `Its ${variant.label} version: the same ${noun} with its ${variant.label} swaps` }
              ]}
              value={props.version}
              onChange={props.onVersion}
            />
          )}
          {colors.length > 0 && (
            <span
              className="header-colors"
              tabIndex={0}
              aria-label={`${colorName ?? 'Colors'}: ${colors.map((color) => COLOR_NAMES[color]).join(', ')}`}
            >
              {colors.map((color) => (
                <img key={color} src={MANA_SYMBOLS[color]} alt="" draggable={false} />
              ))}
              {colorName && (
                <span className="tip" role="tooltip" aria-hidden="true">
                  {colorName}
                </span>
              )}
            </span>
          )}
          {other ? (
            <span className="duel-rules">
              <Icon name="lock" /> {other.formatLabel}
            </span>
          ) : (
            <label className="field-inline format-field">
              Format
              <FormatSelect value={format?.id ?? ''} onChange={(id) => props.onFormat(id || null)} label="Deck format" />
            </label>
          )}
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
              {`${ownershipErrors === 1 ? 'card needs' : 'cards need'} more copies`}
            </button>
          )}
        </div>
      </div>
      <div className="header-actions">
        {props.onMakeWishlist && (
          <button type="button" className="primary" onClick={props.onMakeWishlist}>
            Make it a Wishlist
          </button>
        )}
        <button type="button" onClick={props.onEditText}>
          Edit as text
        </button>
        <MenuButton
          label={`More ${noun} actions`}
          items={[
            { label: 'Copy as text', onSelect: props.onCopy },
            { label: 'Color…', onSelect: props.onColor },
            ...(advanced.length > 0 ? [{ label: 'Advanced', items: advanced }] : []),
            { label: 'Rename…', onSelect: props.onRename },
            // In the other version's view, deleting deletes that version only; the list stays.
            other && props.onToggleVariant
              ? { label: `Delete ${other.label} Version…`, onSelect: props.onToggleVariant, danger: true }
              : { label: `Delete ${noun}…`, onSelect: props.onDelete, danger: true }
          ]}
        />
      </div>
    </header>
  )
}
