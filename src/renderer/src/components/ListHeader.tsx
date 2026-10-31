import { COLOR_NAMES, type ColorFilter } from '@shared/cards'
import { colorIdentityName } from '@shared/colorIdentity'
import { commanderRule, type DeckFormat } from '@shared/formats'
import type { PickMode } from '../hooks/useCommanderPicking'
import { BASE, sameVersion, type ListVersion, type Variant } from '@shared/listVersion'
import { ui } from '@shared/text'
import { MANA_SYMBOLS } from '../lib/artwork'
import { leadersLabel, THEME_TAGS, themeTagColors } from '../lib/themeTags'
import { FORMAT_GROUPS, Segmented } from './Controls'
import { Icon } from './Icon'
import { HeroPortrait } from './HeroArt'
import { MenuButton } from './MenuButton'
import type { HeaderBackground } from '../lib/listFigures'

/** Props of {@link ListHeader}. */
interface ListHeaderProps {
  name: string
  /** Art crops of the commanders: the header becomes an art banner. None for a plain header. */
  arts: string[]
  /** The commanders (two for partners, or a commander and its Background), named over the title. */
  leaders: string[]
  /** The commanders' themes on EDHREC, most decks first: the first three are tagged under the title. */
  themes: string[]
  /** The Background beside the commander, pictured as a badge by its portrait; null for none. */
  background: HeaderBackground | null
  /** The list's Companion, pictured as a badge beside the Background's place; null for none. */
  companionBadge: HeaderBackground | null
  /** Color identity, as mana symbols named on hover: the commanders', else the cards'. */
  colors: ColorFilter[]
  /** Noun used in labels. */
  noun: string
  format: DeckFormat | null
  /** Commander picking mode, while picking: a commander, or a partner for it. */
  picking: PickMode | null
  /** The list has a commander. */
  hasCommander: boolean
  /** Some card can lead the list, or the commander can be removed. */
  canPickCommander: boolean
  legalityErrors: number
  /** Problems of the whole list: its size, its sideboard. */
  listProblems: string[]
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
  /** The list's Cards with a Companion ability, which can be its Companion. */
  companions: string[]
  /** The list's Companion; null for none. */
  companion: string | null
  onCompanion: (name: string | null) => void
  /** The colors a Rulebreaker commander lets the list add to some Cards; null without one. */
  colorChoices: ColorFilter[] | null
  /** The color chosen of `colorChoices`; null for none yet. */
  rulebreakerColor: string | null
  onRulebreakerColor: (color: string | null) => void
  onEditText: () => void
  /** Opens a starting hand, from the banner; absent while the list has fewer than seven cards to draw. */
  onStartingHand?: () => void
  /** Opens the color picker. */
  onColor: () => void
  /** Wishlists: opens the picker of the deck it upgrades. */
  onUpgrade?: () => void
  /**
   * Wishlists and brews: the set group whose Versions they prefer, with its set symbol, shown as a
   * sticker slapped on the banner; null for none.
   */
  preferred?: { name: string; icon?: string } | null
  /** Wishlists and brews: opens the Universes picker. */
  onPreferredVersions?: () => void
  /** Decks: whether it is unbuilt, using your cards without reserving them. */
  unbuilt?: boolean
  /** Decks: toggles unbuilt. */
  onToggleUnbuilt?: () => void
  /** Lists with Cards that make or spend energy: whether Statistics shows the energy curve, and its toggle. */
  energyCurve?: { on: boolean; onToggle: () => void }
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
 * List title bar: the commanders and their themes, commander picking, problem badges and list
 * actions; the format is set in the ⋯ menu. With the commanders' art it is a banner: their whole art
 * at the right, blurred behind the title.
 */
export function ListHeader(props: ListHeaderProps) {
  const { name, noun, format, legalityErrors, ownershipErrors, onlyProblems, arts, leaders, colors } = props
  const colorName = colorIdentityName(colors)
  const { picking, hasCommander, canPickCommander, partnerKind } = props
  const text = ui.list.header
  const problemsTitle = onlyProblems ? text.showAll : text.showProblems
  const { variants, formatVariant } = props
  const other = variants.find((variant) => sameVersion(variant.label, props.version)) ?? null
  const leadersName = leadersLabel(leaders)
  const tags = props.themes.slice(0, THEME_TAGS)
  const tagColors = themeTagColors(tags, colors)
  // Commander goes without saying under the commanders; other formats are named.
  const formatNote = !other && format && (leaders.length === 0 || format.id !== 'commander') ? format.label : null
  const canChangeCommander = !!format?.commander && hasCommander && canPickCommander && !picking
  const colorSymbols = colors.length > 0 && (
    <span
      className="header-colors"
      tabIndex={0}
      aria-label={text.identity(colorName ?? text.colors, colors.map((color) => COLOR_NAMES[color]).join(', '))}
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
  )
  const brewBadge = props.onMakeWishlist && (
    <span className="brew-badge" title={text.brewHint}>
      {text.brew}
    </span>
  )
  const advanced = [
    ...(props.onUpgrade ? [{ label: text.upgradeOf, onSelect: props.onUpgrade }] : []),
    ...(props.onToggleUnbuilt ? [{ label: text.unbuilt, checked: !!props.unbuilt, onSelect: props.onToggleUnbuilt }] : []),
    ...(props.energyCurve ? [{ label: text.energyCurve, checked: props.energyCurve.on, onSelect: props.energyCurve.onToggle }] : []),
    ...(formatVariant ? [{ label: text.addFormatVersion(formatVariant.label), onSelect: props.onAddFormatVersion }] : []),
    { label: text.addVersion, onSelect: props.onAddVersion },
    ...(other && props.onRenameVersion ? [{ label: text.renameVersion(other.label), onSelect: props.onRenameVersion }] : [])
  ]
  // The list's Universe: its set symbol, or a star while the groups load.
  const preferred = props.preferred
  const symbol = () =>
    preferred?.icon ? (
      <span className="universe-symbol" style={{ maskImage: `url("${preferred.icon}")`, WebkitMaskImage: `url("${preferred.icon}")` }} aria-hidden="true" />
    ) : (
      <Icon name="star" />
    )
  // A tag after the theme tags, in white with the set symbol.
  const universeTag = preferred && (
    <li className="theme-tag universe-tag">
      <button type="button" onClick={props.onPreferredVersions} title={`${text.preferredSticker(preferred.name)} · ${text.preferredStickerHint}`}>
        {symbol()}
        {preferred.name}
      </button>
    </li>
  )
  return (
    <header className={`view-header${arts.length > 0 ? ' art-hero' : ''}${other ? ' variant-view' : ''}`}>
      <HeroPortrait arts={arts} />
      {arts.length > 0 && props.onStartingHand && (
        <div className="hero-art-picks">
          <button type="button" className="icon-btn" onClick={props.onStartingHand} aria-label={ui.startingHand.title} title={ui.startingHand.title}>
            <Icon name="hand" />
          </button>
        </div>
      )}
      {arts.length > 0 && props.background?.art && (
        <figure className="hero-background" data-mana={props.background.color} title={text.backgroundHint(props.background.name)}>
          <img src={props.background.art} alt="" draggable={false} />
          <figcaption>{text.background}</figcaption>
        </figure>
      )}
      {arts.length > 0 && props.companionBadge?.art && (
        <figure
          className={`hero-background${props.background?.art ? ' beside' : ''}`}
          data-mana={props.companionBadge.color}
          title={text.companionHint(props.companionBadge.name)}
        >
          <img src={props.companionBadge.art} alt="" draggable={false} />
          <figcaption>{text.companion}</figcaption>
        </figure>
      )}
      <div className="header-title">
        {leaders.length > 0 ? (
          <p className="header-leaders">
            {colorSymbols}
            <span title={ui.common.and(leaders)}>{leadersName}</span>
            {brewBadge}
          </p>
        ) : (
          brewBadge
        )}
        <h1>{name}</h1>
        {(tags.length > 0 || universeTag) && (
          <ul className="theme-tags" aria-label={text.themes}>
            {tags.map((theme, i) => (
              <li key={theme} className="theme-tag" data-mana={tagColors[i]} title={text.themeHint(leadersName)}>
                {theme}
              </li>
            ))}
            {universeTag}
          </ul>
        )}
        <div className="header-meta">
          {variants.length > 0 && (
            <Segmented
              label={text.version}
              className="version-toggle"
              options={[
                { id: BASE, label: props.baseLabel, title: text.baseHint(noun) },
                ...variants.map((variant) => ({
                  id: variant.label,
                  label: variant.label,
                  title: text.variantHint(variant.label, noun)
                }))
              ]}
              value={other?.label ?? BASE}
              onChange={props.onVersion}
            />
          )}
          {leaders.length === 0 && colorSymbols}
          {other && props.versionFormat && (
            <span className="duel-rules">
              <Icon name="lock" /> {props.versionFormat}
            </span>
          )}
          {formatNote && <span className="header-format">{formatNote}</span>}
          {/* Sets the first commander, and cancels picking; changing it is in the ⋯ menu. */}
          {format?.commander && (picking === 'commander' || (!picking && !hasCommander && canPickCommander)) && (
            <button
              type="button"
              className={`wand-btn${picking ? ' on' : ''}`}
              onClick={() => props.onTogglePicking('commander')}
              aria-pressed={picking === 'commander'}
              title={
                picking ? text.cancelPicking : text.pickHint(noun, format.label, commanderRule(format), hasCommander)
              }
            >
              <Icon name="wand" />
              {picking ? text.picking : text.setCommander}
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
                  ? text.cancelPicking
                  : props.canPickPartner
                    ? text.joinHint(props.leaderName ?? '')
                    : text.joinFirst(props.leaderName ?? '', noun)
              }
            >
              <Icon name="wand" />
              {picking ? text.pickingPartner(text.partnerKinds[partnerKind]) : text.addPartner(text.partnerKinds[partnerKind])}
            </button>
          )}
          {legalityErrors + props.listProblems.length > 0 && (
            <button
              type="button"
              className={`chip illegal issue-badge${onlyProblems ? ' on' : ''}`}
              onClick={props.onToggleProblems}
              title={problemsTitle}
            >
              {[...(legalityErrors > 0 ? [text.breaksRules(legalityErrors)] : []), ...props.listProblems].join(' · ')}
            </button>
          )}
          {ownershipErrors > 0 && (
            <button
              type="button"
              className={`chip short issue-badge${onlyProblems ? ' on' : ''}`}
              onClick={props.onToggleProblems}
              title={problemsTitle}
            >
              {text.needsCopies(ownershipErrors)}
            </button>
          )}
        </div>
      </div>
      <div className="header-actions">
        {props.onMakeWishlist && (
          <button type="button" className="primary" onClick={props.onMakeWishlist}>
            {text.makeWishlist}
          </button>
        )}
        <button type="button" onClick={props.onEditText}>
          {text.editAsText}
        </button>
        <MenuButton
          label={text.more(noun)}
          items={[
            ...(canChangeCommander ? [{ label: text.changeCommander, onSelect: () => props.onTogglePicking('commander') }] : []),
            { label: text.color, onSelect: props.onColor },
            { label: text.rename, onSelect: props.onRename },
            // In a version's view, deleting deletes that version only; the list stays.
            other && props.onDeleteVersion
              ? { label: text.deleteVersion(other.label), onSelect: props.onDeleteVersion, danger: true }
              : { label: text.delete, onSelect: props.onDelete, danger: true },
            ...(props.onPreferredVersions ? [{ label: text.preferredVersions, icon: 'star' as const, onSelect: props.onPreferredVersions }] : []),
            ...(props.companions.length > 0 || props.companion
              ? [
                  {
                    label: text.companion,
                    items: [
                      { label: text.noCompanion, checked: !props.companion, onSelect: () => props.onCompanion(null) },
                      ...props.companions.map((card) => ({
                        label: card,
                        checked: props.companion === card,
                        onSelect: () => props.onCompanion(card)
                      }))
                    ]
                  }
                ]
              : []),
            ...(props.colorChoices
              ? [
                  {
                    label: text.rulebreakerColor,
                    items: props.colorChoices.map((color) => ({
                      label: COLOR_NAMES[color],
                      checked: props.rulebreakerColor === color,
                      onSelect: () => props.onRulebreakerColor(props.rulebreakerColor === color ? null : color)
                    }))
                  }
                ]
              : []),
            // A version follows its own format, shown locked in the header.
            ...(other
              ? []
              : [
                  {
                    label: text.format,
                    items: [
                      { label: ui.common.noFormat, checked: !format, onSelect: () => props.onFormat(null) },
                      ...FORMAT_GROUPS.map((group) => ({
                        label: group.label,
                        items: group.formats.map((choice) => ({
                          label: choice.label,
                          checked: format?.id === choice.id,
                          onSelect: () => props.onFormat(choice.id)
                        }))
                      }))
                    ]
                  }
                ]),
            ...(advanced.length > 0 ? [{ label: text.advanced, items: advanced }] : [])
          ]}
        />
      </div>
    </header>
  )
}
