import type { ReactNode } from 'react'
import { isCardSort, sortOptionsFor, type ColorFilter, type SortKey, type SortView } from '@shared/cards'
import { FORMATS, formatGroup, type FormatGroup } from '@shared/formats'
import { colorIdentityName } from '@shared/colorIdentity'
import { deckPalette, PALETTE_GROUPS, type IdentityKey } from '@shared/deckPalettes'
import { DEFAULT_FACE, TEMPERAMENTS, TEXTURES, hasIdentityTexture, type Temperament, type Texture } from '@shared/temperaments'
import { THEME_COLORS, type ThemeColor } from '@shared/themes'
import { ui } from '@shared/text'
import { MANA_SYMBOLS, THEME_ICONS } from '../lib/artwork'
import { updateSettings } from '../stores/settings'

/**
 * Small controls shared by pages and dialogs.
 *
 * @packageDocumentation
 */

/** Props of {@link Segmented}. */
interface SegmentedProps<T extends string> {
  /** Accessible name of the group. */
  label: string
  options: ReadonlyArray<{ id: T; label: ReactNode; title?: string }>
  value: T
  onChange: (id: T) => void
  /** Page tabs (a tablist) rather than a choice (a radio group). */
  tabs?: boolean
  className?: string
}

/** Row of mutually exclusive buttons, the selected one raised. */
export function Segmented<T extends string>({ label, options, value, onChange, tabs, className }: SegmentedProps<T>) {
  return (
    <div className={`segmented${className ? ` ${className}` : ''}`} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label}>
      {options.map((option) => {
        const on = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            className={on ? 'selected' : undefined}
            title={option.title}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Props of {@link SortSelect}. */
interface SortSelectProps<T extends string> {
  value: T
  /** Sort options; a hint explains an option on hover. */
  options: ReadonlyArray<{ id: T; label: string; hint?: string }>
  onChange: (id: T) => void
  /** Tooltip; defaults to the selected option's hint. */
  title?: string
}

/** `Sort` dropdown of a filter bar. */
export function SortSelect<T extends string>({ value, options, onChange, title }: SortSelectProps<T>) {
  return (
    <label className="field-inline">
      {ui.common.sort}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        title={title ?? (options.find((option) => option.id === value)?.hint || undefined)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} title={option.hint || undefined}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** {@link SortSelect} of the card sort shared by decks, wishlists and the inventory, with the options `view` offers. */
export function CardSortSelect({ view, value }: { view: SortView; value: SortKey }) {
  return (
    <SortSelect
      value={value}
      options={sortOptionsFor(view).map((option) => ({ id: option.id, label: ui.sorts[option.id] }))}
      onChange={(sort) => void updateSettings({ sort, sortReverse: false })}
      title={ui.common.sortAppliesEverywhere}
    />
  )
}

/** Props of {@link SortHeader}. */
interface SortHeaderProps {
  /** Sort the column sorts by. */
  id: SortKey
  label: string
  /** Current sort and direction. */
  sort: SortKey
  reverse: boolean
  className?: string
  title?: string
}

/**
 * Table column header sorting by `id`: a click sorts by it in its usual direction (A–Z for card
 * sorts, highest first otherwise), a second click reverses. Sets the global sort, like {@link CardSortSelect}.
 */
export function SortHeader({ id, label, sort, reverse, className, title }: SortHeaderProps) {
  const active = sort === id
  const ascending = isCardSort(id) !== (active && reverse)
  return (
    <th className={className} title={title} aria-sort={active ? (ascending ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className={`th-sort${active ? ' active' : ''}`}
        onClick={() => void updateSettings(active ? { sortReverse: !reverse } : { sort: id, sortReverse: false })}
      >
        {label}
        {active && <span aria-hidden="true">{ascending ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}

/** Props of {@link FormatSelect}. */
interface FormatSelectProps {
  /** Format id; `''` for none. */
  value: string
  onChange: (formatId: string) => void
  /** Accessible name, when the select has no visible label. */
  label?: string
}

/** Formats by menu group: constructed, commander, then Arena. */
export const FORMAT_GROUPS = (['constructed', 'commander', 'arena'] as FormatGroup[]).map((group) => ({
  group,
  label: ui.common.formatGroups[group],
  formats: FORMATS.filter((format) => formatGroup(format) === group)
}))

/** Format dropdown, `No format` first, then the formats by group. */
export function FormatSelect({ value, onChange, label }: FormatSelectProps) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value="">{ui.common.noFormat}</option>
      {FORMAT_GROUPS.map(({ group, label: name, formats }) => (
        <optgroup key={group} label={name}>
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Props of {@link ColorOptions}. */
interface ColorOptionsProps {
  /** Selected color; null for {@link ColorOptionsProps.inherit}. */
  value: ThemeColor | null
  onChange: (color: ThemeColor | null) => void
  /** Leading `Default` option (null) following the app color, pictured with that color's icon. */
  inherit?: ThemeColor
}

/** Color choice: each color's app icon, mana symbol and name. */
export function ColorOptions({ value, onChange, inherit }: ColorOptionsProps) {
  const option = (id: ThemeColor | null, icon: string, label: ReactNode, title: string) => (
    <button
      key={id ?? 'default'}
      type="button"
      role="radio"
      aria-checked={value === id}
      className={`color-option${value === id ? ' selected' : ''}`}
      onClick={() => onChange(id)}
      title={title}
    >
      <img className="color-icon" src={icon} alt="" draggable={false} />
      <span className="color-label">{label}</span>
    </button>
  )
  return (
    <div className={`color-options${inherit ? ' list-colors' : ''}`} role="radiogroup" aria-label={ui.common.color}>
      {inherit && option(null, THEME_ICONS[inherit], ui.common.colorDefault, ui.common.colorDefaultHint)}
      {THEME_COLORS.map((color) =>
        option(
          color.id,
          THEME_ICONS[color.id],
          <>
            <img className="color-mana" src={MANA_SYMBOLS[color.id]} alt="" draggable={false} />
            {color.label}
          </>,
          `${color.label} (${color.look})`
        )
      )}
    </div>
  )
}

/** Props of {@link PaletteOptions}. */
interface PaletteOptionsProps {
  /** Selected palette; null to follow `identity`. */
  value: IdentityKey | null
  /** The deck's own identity, which the leading option follows. */
  identity: IdentityKey | null
  onChange: (key: IdentityKey | null) => void
}

/** Palette choice: the deck's own identity first, then every identity's palette, grouped. */
export function PaletteOptions({ value, identity, onChange }: PaletteOptionsProps) {
  const text = ui.listDialogs.palette
  const nameOf = (key: IdentityKey) => colorIdentityName(key.split('') as ColorFilter[]) ?? key
  const option = (key: IdentityKey | null, label: string, title?: string) => {
    const shown = key ?? identity
    const palette = shown ? deckPalette(shown) : null
    return (
      <button
        key={key ?? 'auto'}
        type="button"
        role="radio"
        aria-checked={value === key}
        className={`palette-option${value === key ? ' selected' : ''}${key ? '' : ' auto'}`}
        onClick={() => onChange(key)}
        title={title}
      >
        <span className="palette-strip" aria-hidden="true">
          {palette?.swatches.map((swatch, index) => <span key={index} style={{ background: swatch }} />)}
        </span>
        <span className="palette-label">
          {shown && shown !== 'C' && (
            <span className="palette-mana">
              {shown.split('').map((color) => (
                <img key={color} src={MANA_SYMBOLS[color as ColorFilter]} alt="" draggable={false} />
              ))}
            </span>
          )}
          {label}
        </span>
      </button>
    )
  }
  return (
    <div className="palette-options" role="radiogroup" aria-label={text.label}>
      {option(null, text.auto, identity ? text.autoHint(nameOf(identity)) : undefined)}
      {PALETTE_GROUPS.map((group) => (
        <section key={group.id} className="palette-group">
          <h3>{text.groups[group.id]}</h3>
          <div className="palette-grid">{group.keys.map((key) => option(key, nameOf(key)))}</div>
        </section>
      ))}
    </div>
  )
}

/** A deck banner's colors, which texture and typeface choices are drawn on. */
interface BannerColors {
  ground: string
  text: string
}

/** Props of {@link TextureOptions}. */
interface TextureOptionsProps {
  /** Selected texture; null for none. */
  value: Texture | null
  banner: BannerColors
  /** Key of the palette the banner uses, which the identity texture draws. */
  palette: string | null
  onChange: (texture: Texture | null) => void
}

/** Banner texture choice: none first, then each texture as a small swatch of the deck's banner. */
export function TextureOptions({ value, banner, palette, onChange }: TextureOptionsProps) {
  const text = ui.listDialogs.style
  return (
    <div className="style-grid" role="radiogroup" aria-label={text.texture}>
      {([null, ...TEXTURES] as const).map((texture) => {
        const unavailable = texture === 'identity' && !hasIdentityTexture(palette)
        return (
          <button
            key={texture ?? 'none'}
            type="button"
            role="radio"
            aria-checked={value === texture}
            className={`palette-option${value === texture ? ' selected' : ''}`}
            disabled={unavailable}
            title={unavailable ? text.identityOnly : undefined}
            onClick={() => onChange(texture)}
          >
            <span className="texture-swatch" data-texture={texture ?? undefined} data-palette={palette ?? undefined} style={{ background: banner.ground }} aria-hidden="true" />
            <span className="palette-label">{texture ? text.textures[texture] : text.textureNone}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Props of {@link TypefaceOptions}. */
interface TypefaceOptionsProps {
  /** Selected face, by its temperament; null for the app's own. */
  value: Temperament | null
  /** Text each face is shown in: the list's name. */
  sample: string
  banner: BannerColors
  onChange: (temperament: Temperament | null) => void
}

/** Typeface choice: the app's own face first, then every display face, each set in the list's name. */
export function TypefaceOptions({ value, sample, banner, onChange }: TypefaceOptionsProps) {
  const text = ui.listDialogs.style
  const option = (temperament: Temperament | null) => {
    const style = temperament ? TEMPERAMENTS[temperament] : DEFAULT_FACE
    return (
      <button
        key={temperament ?? 'default'}
        type="button"
        role="radio"
        aria-checked={value === temperament}
        className={`palette-option${value === temperament ? ' selected' : ''}`}
        onClick={() => onChange(temperament)}
      >
        <span
          className="typeface-sample"
          style={{
            background: banner.ground,
            color: banner.text,
            fontFamily: style.face,
            fontWeight: style.weight,
            fontStyle: style.slanted ? 'italic' : 'normal',
            textTransform: style.caps ? 'uppercase' : 'none'
          }}
        >
          {sample}
        </span>
        <span className="palette-label">{temperament ? style.name : text.typefaceDefault}</span>
      </button>
    )
  }
  return (
    <div className="style-grid" role="radiogroup" aria-label={text.typeface}>
      {option(null)}
      {(Object.keys(TEMPERAMENTS) as Temperament[]).map(option)}
    </div>
  )
}
