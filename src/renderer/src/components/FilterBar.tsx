import type { ReactNode } from 'react'
import { ui } from '@shared/text'
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

/** Rarity toggles: id and the letter shown; names are `ui.filters.rarities`. */
const RARITY_BUTTONS = [
  { id: 'common', short: 'C' },
  { id: 'uncommon', short: 'U' },
  { id: 'rare', short: 'R' },
  { id: 'mythic', short: 'M' }
]

/** Color match modes, in the order offered; names are `ui.filters.colorModes`. */
const COLOR_MODES: ColorMode[] = ['any', 'exact', 'within']

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
        <div className="filter-group">
          <div className="toggle-group" role="group" aria-label={ui.filters.colors} title={ui.filters.colorsHint}>
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
              aria-label={ui.filters.colorMode}
              title={ui.filters.colorModeHint}
            >
              {COLOR_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {ui.filters.colorModes[mode]}
                </option>
              ))}
            </select>
          )}
        </div>
        <select value={filters.type} onChange={(event) => set({ type: event.target.value })} aria-label={ui.filters.cardType}>
          <option value="">{ui.filters.allTypes}</option>
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <div className="filter-group">
          <div className="toggle-group" role="group" aria-label={ui.filters.rarity} title={ui.filters.rarity}>
            {RARITY_BUTTONS.map((rarity) => {
              const on = filters.rarities.includes(rarity.id)
              return (
                <button
                  key={rarity.id}
                  type="button"
                  className={`rarity rarity-${rarity.id}${on ? ' on' : ''}`}
                  aria-pressed={on}
                  aria-label={ui.filters.rarities[rarity.id]}
                  title={ui.filters.rarities[rarity.id]}
                  onClick={() => set({ rarities: toggle(filters.rarities, rarity.id) })}
                >
                  {rarity.short}
                </button>
              )
            })}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={filters.legendary} onChange={(event) => set({ legendary: event.target.checked })} />
          {ui.filters.legendary}
        </label>
        {filters.manaValue !== null && (
          <button
            type="button"
            className="chip link curve-filter"
            onClick={() => set({ manaValue: null })}
            title={ui.filters.manaValueHint}
          >
            {ui.filters.manaValue(filters.manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(filters.manaValue))}
          </button>
        )}
        {filtersActive(filters) && (
          <button type="button" className="link-btn" onClick={() => onChange(NO_FILTERS)}>
            {ui.filters.clear}
          </button>
        )}
        {children}
        {end && <div className="filter-end">{end}</div>}
      </div>
      {loadingNote && <p className="muted small filter-note">{loadingNote}</p>}
    </div>
  )
}
