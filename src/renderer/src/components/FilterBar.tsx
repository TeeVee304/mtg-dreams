import type { ReactNode } from 'react'
import { CARD_TYPES, filtersActive, NO_FILTERS, type CardFilters, type ColorFilter, type ColorMode } from '../../../shared/cards'
import { MANA_SYMBOLS } from '../artwork'

const COLOR_BUTTONS: Array<{ id: ColorFilter; label: string }> = [
  { id: 'W', label: 'White' },
  { id: 'U', label: 'Blue' },
  { id: 'B', label: 'Black' },
  { id: 'R', label: 'Red' },
  { id: 'G', label: 'Green' },
  { id: 'C', label: 'Colorless' }
]

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

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

interface FilterBarProps {
  filters: CardFilters
  onChange: (filters: CardFilters) => void
  namePlaceholder: string
  /** Shown while some cards' data is still loading and data filters are on. */
  loadingNote?: string
  /** Extra controls on the second row (owned toggles, sort, counts). */
  children?: ReactNode
}

export function FilterBar({ filters, onChange, namePlaceholder, loadingNote, children }: FilterBarProps) {
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
          {COLOR_BUTTONS.map((color) => {
            const on = filters.colors.includes(color.id)
            return (
              <button
                key={color.id}
                type="button"
                className={`mana${on ? ' on' : ''}`}
                aria-pressed={on}
                aria-label={color.label}
                title={color.label}
                onClick={() => set({ colors: toggle(filters.colors, color.id) })}
              >
                <img src={MANA_SYMBOLS[color.id]} alt="" draggable={false} />
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
        {filtersActive(filters) && (
          <button type="button" className="link-btn" onClick={() => onChange(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
      {(children || loadingNote) && (
        <div className="filter-row">
          {children}
          {loadingNote && <span className="muted small">{loadingNote}</span>}
        </div>
      )}
    </div>
  )
}
