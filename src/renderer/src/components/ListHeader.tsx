import { COLOR_NAMES, type ColorFilter } from '@shared/cards'
import { colorIdentityName } from '@shared/colorIdentity'
import { commanderRule, type DeckFormat } from '@shared/formats'
import type { PickMode } from '../hooks/useCommanderPicking'
import { BASE, sameVersion, type ListVersion, type Variant } from '@shared/listVersion'
import { MANA_SYMBOLS } from '../lib/artwork'
import { FormatSelect, Segmented } from './Controls'
import { Icon } from './Icon'
import { HeroArt } from './HeroArt'
import { MenuButton } from './MenuButton'

/** Props of {@link ListHeader}. */
interface ListHeaderProps {
  name: string
  /** Art crops of the commanders: the header becomes an art banner. None for a plain header. */
  arts: string[]
  /** The commanders (two for partners), named under the title. */
  leaders: string[]
  /** Color identity, as mana symbols named on hover: the commanders', else the cards'. */
  colors: ColorFilter[]
  /** Noun used in labels. */
  noun: 'deck' | 'list'
  format: DeckFormat | null
  /** Commander picking mode, while picking: a commander, or a partner for it. */
  picking: PickMode | null
  /** The list has a commander. */
  hasCommander: boolean
  /** Some card can lead the list, or the commander can be removed. */
  canPickCommander: boolean
  legalityErrors: number
  ownershipErrors: number
  /** Problem-only filter active. */
  onlyProblems: boolean
  onToggleProblems: () => void
  onTogglePicking: (mode: PickMode) => void
  /** `Partner` or `Background` while the only commander can take one: offers adding it. */
  partnerKind: 'Partner' | 'Background' | null
  /** Some card in the list can join the commander. */
  canPickPartner: boolean
  /** The only commander, which a partner joins. */
  leaderName: string | null
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
  /** The list's versions (Duel or EDH, then named ones); none for a list without. */
  variants: Variant[]
  /** The list itself, named in the version toggle: `Commander`, `Duel`, `Main`. */
  baseLabel: string
  /** The version shown: `base`, or one of `variants`. */
  version: ListVersion
  /** Full name of the format the version shown follows (`Duel Commander`); null for the list itself. */
  versionFormat: string | null
  /** Shows a version. */
  onVersion: (version: ListVersion) => void
  /** The other-format version the list's format allows, while the list lacks it (Duel, EDH); null otherwise. */
  formatVariant: Variant | null
  /** Adds the other-format version. */
  onAddFormatVersion: () => void
  /** Asks for a name, and adds a version of that name. */
  onAddVersion: () => void
  /** A named version shown: asks for its new name. */
  onRenameVersion?: () => void
  /** A version shown: deletes it (the list stays). */
  onDeleteVersion?: () => void
  /** Brews: makes it a wishlist; the header then shows it is a brew. */
  onMakeWishlist?: () => void
  onRename: () => void
  onDelete: () => void
}

/**
 * List title bar: format select, commander picking, problem badges and list actions. With the
 * commanders' art it is a banner: the art behind the title, darkened toward the text.
 */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, legalityErrors, ownershipErrors, onlyProblems, arts, leaders, colors } = props
  const colorName = colorIdentityName(colors)
  const { picking, hasCommander, canPickCommander, partnerKind } = props
  const problemsTitle = onlyProblems ? 'Show all cards' : 'Show only cards with problems'
  const { variants, formatVariant } = props
  const other = variants.find((variant) => sameVersion(variant.label, props.version)) ?? null
  const advanced = [
    ...(props.onUpgrade ? [{ label: 'Upgrade of…', onSelect: props.onUpgrade }] : []),
    ...(props.onToggleUnbuilt ? [{ label: 'Unbuilt', checked: !!props.unbuilt, onSelect: props.onToggleUnbuilt }] : []),
    ...(formatVariant ? [{ label: `Add ${formatVariant.label} Version`, onSelect: props.onAddFormatVersion }] : []),
    { label: 'Add Version…', onSelect: props.onAddVersion },
    ...(other && props.onRenameVersion ? [{ label: `Rename ${other.label} Version…`, onSelect: props.onRenameVersion }] : [])
  ]
  return (
    <header className={`view-header${arts.length > 0 ? ' art-hero' : ''}${other ? ' variant-view' : ''}`}>
      <HeroArt arts={arts} className="hero-art" />
      <div className="header-title">
        {other && <span className="duel-badge">{other.label} version</span>}
        {props.onMakeWishlist && (
          <span className="brew-badge" title="An idea: it counts toward nothing, not even Most Wanted">
            Brew
          </span>
        )}
        <h1>{name}</h1>
        {leaders.length > 0 && (
          <p className="hero-leader">
            Led by <strong>{leaders[0]}</strong>
            {leaders.length > 1 && (
              <>
                {' '}
                and <strong>{leaders[1]}</strong>
              </>
            )}
          </p>
        )}
        <div className="header-meta">
          {variants.length > 0 && (
            <Segmented
              label="Version"
              className="version-toggle"
              options={[
                { id: BASE, label: props.baseLabel, title: `The ${noun} itself` },
                ...variants.map((variant) => ({
                  id: variant.label,
                  label: variant.label,
                  title: `Its ${variant.label} version: the same ${noun} with its ${variant.label} swaps`
                }))
              ]}
              value={other?.label ?? BASE}
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
            props.versionFormat && (
              <span className="duel-rules">
                <Icon name="lock" /> {props.versionFormat}
              </span>
            )
          ) : (
            <label className="field-inline format-field">
              Format
              <FormatSelect value={format?.id ?? ''} onChange={(id) => props.onFormat(id || null)} label="Deck format" />
            </label>
          )}
          {format?.commander && (picking === 'commander' || (!picking && canPickCommander)) && (
            <button
              type="button"
              className={`wand-btn${picking ? ' on' : ''}`}
              onClick={() => props.onTogglePicking('commander')}
              aria-pressed={picking === 'commander'}
              title={
                picking
                  ? 'Cancel (Esc)'
                  : `Then click the card that leads this ${noun}. In ${format.label} it must be ${commanderRule(format)}.${hasCommander ? ' Click a Commander to remove it.' : ''}`
              }
            >
              <Icon name="wand" />
              {picking ? 'Click your Commander… (Esc to cancel)' : hasCommander ? 'Change Commander' : 'Set Commander'}
            </button>
          )}
          {partnerKind && (picking === 'partner' || !picking) && (
            <button
              type="button"
              className={`wand-btn${picking ? ' on' : ''}`}
              onClick={() => props.onTogglePicking('partner')}
              aria-pressed={picking === 'partner'}
              disabled={!props.canPickPartner}
              title={
                picking
                  ? 'Cancel (Esc)'
                  : props.canPickPartner
                    ? `Then click the card that joins ${props.leaderName} as your second Commander.`
                    : `Add a card that can join ${props.leaderName} to this ${noun} first.`
              }
            >
              <Icon name="wand" />
              {picking ? `Click a ${partnerKind}… (Esc to cancel)` : `Add ${partnerKind}`}
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
            // In a version's view, deleting deletes that version only; the list stays.
            other && props.onDeleteVersion
              ? { label: `Delete ${other.label} Version…`, onSelect: props.onDeleteVersion, danger: true }
              : { label: `Delete ${noun}…`, onSelect: props.onDelete, danger: true }
          ]}
        />
      </div>
    </header>
  )
}
