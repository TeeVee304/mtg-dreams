import type { ReactNode } from 'react'
import { sortOptionsFor, type SortKey, type SortView } from '@shared/cards'
import { FORMATS } from '@shared/formats'
import { THEME_COLORS, type ThemeColor } from '@shared/themes'
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
      Sort
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
      options={sortOptionsFor(view)}
      onChange={(sort) => void updateSettings({ sort })}
      title="Applies to all decks, wishlists and the inventory"
    />
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

/** Format dropdown, `No format` first. */
export function FormatSelect({ value, onChange, label }: FormatSelectProps) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value="">No format</option>
      {FORMATS.map((format) => (
        <option key={format.id} value={format.id}>
          {format.label}
        </option>
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
    <div className={`color-options${inherit ? ' list-colors' : ''}`} role="radiogroup" aria-label="Color">
      {inherit && option(null, THEME_ICONS[inherit], 'Default', 'Follow the app color (Settings)')}
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
