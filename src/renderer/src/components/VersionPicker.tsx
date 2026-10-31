import { useMemo, useState, type ReactNode } from 'react'
import { priceOf, resolveLine, sortPrintings } from '@shared/pricing'
import type { Printing } from '@shared/types'
import { ui } from '@shared/text'
import { useStoredValue } from '../hooks/useStoredValue'
import { formatEur } from '../lib/format'
import { useSettings } from '../stores/settings'
import { Segmented } from './Controls'
import { previewHandlers } from './HoverPreview'
import { CardThumb } from './Placeholders'

/** Selection value for the cheapest printing. */
export const AUTO = 'auto'

/** How versions are shown: compact rows (default) or card images. */
type VersionView = 'list' | 'images'

/** Type guard for {@link VersionView}. */
const isVersionView = (value: string): value is VersionView => value === 'list' || value === 'images'

/** Version view options. */
const VERSION_VIEWS = [
  { id: 'list', label: ui.card.picker.views.list },
  { id: 'images', label: ui.card.picker.views.images }
] as const

/** The first option's title and note, when it means something other than the cheapest Version. */
export interface AutoOption {
  title: string
  subtitle: string
}

/** Props of {@link VersionPicker}. */
interface VersionPickerProps {
  printings: Printing[]
  /** Finish used for prices. */
  foil: boolean
  /** Printing id, or {@link AUTO}. */
  selected: string
  onSelect: (id: string) => void
  /** Double-click confirm. */
  onConfirm?: () => void
  /**
   * Hovering a version shows it here (null when the pointer leaves) instead of in the floating
   * preview, for a picker beside a large image of the card.
   */
  onPreview?: (printing: Printing | null) => void
  /** See {@link AutoOption}. */
  auto?: AutoOption
  /** Title at the start of the filter row, so the picker needs no header of its own. */
  heading?: ReactNode
}

/**
 * Printings with a leading cheapest ({@link AUTO}) option, sorted by {@link sortPrintings}: as rows
 * (set, number, year, tags and price on one line) or as card images; the choice is remembered.
 */
export function VersionPicker({ printings, foil, selected, onSelect, onConfirm, onPreview, auto, heading }: VersionPickerProps) {
  const [filter, setFilter] = useState('')
  const [view, setView] = useStoredValue<VersionView>('mtg-dreams.versionView', 'list', isVersionView)
  const { priceBasis, skipUniversesBeyond, skipSecretLair, skipPhyrexian } = useSettings()
  const sorted = useMemo(() => sortPrintings(printings, foil, priceBasis), [printings, foil, priceBasis])
  const cheapest = useMemo(
    () => resolveLine({ foil }, printings, priceBasis, { skipUniversesBeyond, skipSecretLair, skipPhyrexian }),
    [printings, foil, priceBasis, skipUniversesBeyond, skipSecretLair, skipPhyrexian]
  )

  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? sorted.filter((p) =>
        `${p.setName} ${p.set} ${p.collectorNumber} ${p.labels.join(' ')}`.toLowerCase().includes(needle)
      )
    : sorted
  const Option = view === 'list' ? Row : Tile

  return (
    <div className="picker">
      <div className="picker-head">
        {heading}
        {printings.length > 8 && (
          <input
            className="picker-filter"
            type="search"
            placeholder={ui.card.picker.filter(printings.length)}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        )}
        <span className="spacer" />
        <Segmented label={ui.card.picker.showAs} options={VERSION_VIEWS} value={view} onChange={setView} />
      </div>
      <div className={`picker-options ${view === 'list' ? 'picker-list' : 'picker-grid'}`} role="listbox" aria-label={ui.card.picker.list}>
        {!needle && (
          <Option
            printing={cheapest.printing}
            price={cheapest.unitPrice}
            title={auto?.title ?? ui.card.picker.cheapest}
            subtitle={auto?.subtitle ?? ui.card.picker.cheapestNow(cheapest.printing ? `${cheapest.printing.set.toUpperCase()} #${cheapest.printing.collectorNumber}` : null)}
            selected={selected === AUTO}
            onClick={() => onSelect(AUTO)}
            onDoubleClick={onConfirm}
            onPreview={onPreview}
            auto
          />
        )}
        {shown.map((printing) => (
          <Option
            key={printing.id}
            printing={printing}
            price={priceOf(printing, foil, priceBasis)}
            title={printing.setName}
            subtitle={`${printing.set.toUpperCase()} #${printing.collectorNumber} · ${printing.releasedAt.slice(0, 4)}`}
            selected={selected === printing.id}
            onClick={() => onSelect(printing.id)}
            onDoubleClick={onConfirm}
            onPreview={onPreview}
          />
        ))}
        {shown.length === 0 && <p className="muted">{ui.card.picker.noMatch(filter)}</p>}
      </div>
    </div>
  )
}

/** Props of {@link Tile} and {@link Row}. */
interface OptionProps {
  printing: Printing | null
  price: number | null
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  /** See {@link VersionPickerProps.onPreview}; the floating preview without it. */
  onPreview?: (printing: Printing | null) => void
  /** Cheapest-printing option. */
  auto?: boolean
}

/** Hover handlers of an option: {@link OptionProps.onPreview}, else the floating preview. */
function hoverHandlers({ printing, onPreview }: Pick<OptionProps, 'printing' | 'onPreview'>) {
  if (!onPreview) return previewHandlers({ src: printing?.imageNormal, back: printing?.imageBack })
  return { onMouseEnter: () => onPreview(printing), onMouseLeave: () => onPreview(null) }
}

/** Printing tags (Borderless, Showcase…) as chips; none for the cheapest option. */
function Labels({ printing, auto }: Pick<OptionProps, 'printing' | 'auto'>) {
  if (auto || !printing || printing.labels.length === 0) return null
  return (
    <div className="chips">
      {printing.labels.map((label) => (
        <span key={label} className="chip">
          {label}
        </span>
      ))}
    </div>
  )
}

/** Printing tile with image, price and labels. */
function Tile({ printing, price, title, subtitle, selected, onClick, onDoubleClick, onPreview, auto }: OptionProps) {
  const image = printing?.imageNormal ?? printing?.imageSmall
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`tile${selected ? ' selected' : ''}${auto ? ' auto' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...hoverHandlers({ printing, onPreview })}
    >
      <div className="tile-image">{image ? <img src={image} alt="" loading="lazy" /> : <span>{ui.card.picker.noImage}</span>}</div>
      <div className="tile-price">{formatEur(price)}</div>
      <div className="tile-title">{title}</div>
      <div className="tile-sub">{subtitle}</div>
      <Labels printing={printing} auto={auto} />
    </button>
  )
}

/** Printing row: art crop, set and number, tags and price on one line; the full card shows on hover. */
function Row({ printing, price, title, subtitle, selected, onClick, onDoubleClick, onPreview, auto }: OptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`version-row${selected ? ' selected' : ''}${auto ? ' auto' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...hoverHandlers({ printing, onPreview })}
    >
      <CardThumb src={printing?.imageSmall} />
      <span className="version-row-text">
        <span className="version-row-title">{title}</span>
        <span className="version-row-sub">{subtitle}</span>
      </span>
      <Labels printing={printing} auto={auto} />
      <span className="version-row-price">{formatEur(price)}</span>
    </button>
  )
}
