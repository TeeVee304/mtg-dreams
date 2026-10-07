import type { ReactNode } from 'react'
import {
  CARD_TYPES,
  COLOR_LETTERS,
  COLOR_NAMES,
  CURVE_TOP,
  filtersActive,
  NO_FILTERS,
  type CardFilters,
  type ColorMode
} from '@shared/cards'
import { MANA_SYMBOLS } from '../lib/artwork'

const RARITY_BUTTONS = [
  { id: 'common', short: 'C', label: 'Common' },
  { id: 'uncommon', short: 'U', label: 'Uncommon' },
  { id: 'rare', short: 'R', label: 'Rare' },
  { id: 'mythic', short: 'M', label: 'Mythic rare' }
]

const COLOR_MODES: Array<{ id: ColorMode; label: string }> = [
  { id: 'any', label: 'Any of these' },
  { id: 'exact', label: 'Exactly these' },
  { id: 'within', label: 'Only these' }
]

/** @returns `list` with `item` toggled. */
function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

/** Props of {@link FilterBar}. */
interface FilterBarProps {
  filters: CardFilters
  onChange: (filters: CardFilters) => void
  namePlaceholder: string
  /** Note shown while card data loads and data filters are active. */
  loadingNote?: string
  /** Extra controls after the filters (owned toggles, counts). */
  children?: ReactNode
  /** Controls kept together at the end of the row (view, sort); they wrap as one when the row is full. */
  end?: ReactNode
}

/** Name, color, type, rarity and legendary filters, with the page's own controls on the same row. */
export function FilterBar({ filters, onChange, namePlaceholder, loadingNote, children, end }: FilterBarProps) {
  const set = (patch: Partial<CardFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <input
          type="search"
          className="filter"
          placeholder={namePlaceholder}
          value={filters.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <div className="toggle-group" role="group" aria-label="Colors" title="Colors use color identity, so lands count too">
          {COLOR_LETTERS.map((color) => {
            const on = filters.colors.includes(color)
            return (
              <button
                key={color}
                type="button"
                className={`mana${on ? ' on' : ''}`}
                aria-pressed={on}
                aria-label={COLOR_NAMES[color]}
                title={COLOR_NAMES[color]}
                onClick={() => set({ colors: toggle(filters.colors, color) })}
              >
                <img src={MANA_SYMBOLS[color]} alt="" draggable={false} />
              </button>
            )
          })}
        </div>
        {filters.colors.length > 0 && (
          <select
            value={filters.colorMode}
            onChange={(event) => set({ colorMode: event.target.value as ColorMode })}
            aria-label="How colors match"
            title="“Only these” shows cards that fit within the selected colors, like a Commander color identity"
          >
            {COLOR_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        )}
        <select value={filters.type} onChange={(event) => set({ type: event.target.value })} aria-label="Card type">
          <option value="">All types</option>
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <div className="toggle-group" role="group" aria-label="Rarity">
          {RARITY_BUTTONS.map((rarity) => {
            const on = filters.rarities.includes(rarity.id)
            return (
              <button
                key={rarity.id}
                type="button"
                className={`rarity rarity-${rarity.id}${on ? ' on' : ''}`}
                aria-pressed={on}
                aria-label={rarity.label}
                title={rarity.label}
                onClick={() => set({ rarities: toggle(filters.rarities, rarity.id) })}
              >
                {rarity.short}
              </button>
            )
          })}
        </div>
        <label className="check">
          <input type="checkbox" checked={filters.legendary} onChange={(event) => set({ legendary: event.target.checked })} />
          Legendary
        </label>
        {filters.manaValue !== null && (
          <button
            type="button"
            className="chip link curve-filter"
            onClick={() => set({ manaValue: null })}
            title="Set from the mana curve in Statistics. Click to remove."
          >
            Mana value {filters.manaValue === CURVE_TOP ? `${CURVE_TOP}+` : filters.manaValue} ×
          </button>
        )}
        {filtersActive(filters) && (
          <button type="button" className="link-btn" onClick={() => onChange(NO_FILTERS)}>
            Clear filters
          </button>
        )}
        {children}
        {end && <div className="filter-end">{end}</div>}
      </div>
      {loadingNote && <p className="muted small filter-note">{loadingNote}</p>}
    </div>
  )
}
