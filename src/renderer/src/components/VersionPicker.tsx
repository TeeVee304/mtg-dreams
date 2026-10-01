import { useMemo, useState } from 'react'
import { priceOf, resolveLine, sortPrintings } from '../../../shared/pricing'
import type { Printing } from '../../../shared/types'
import { formatEur } from '../format'
import { useSettings } from '../settings'
import { previewHandlers } from './HoverPreview'

export const AUTO = 'auto'

interface VersionPickerProps {
  printings: Printing[]
  foil: boolean
  /** A printing id, or AUTO for "cheapest version". */
  selected: string
  onSelect: (id: string) => void
  onConfirm?: () => void
}

export function VersionPicker({ printings, foil, selected, onSelect, onConfirm }: VersionPickerProps) {
  const [filter, setFilter] = useState('')
  const { priceBasis } = useSettings()
  const sorted = useMemo(() => sortPrintings(printings, foil, priceBasis), [printings, foil, priceBasis])
  const cheapest = useMemo(() => resolveLine({ foil }, printings, priceBasis), [printings, foil, priceBasis])

  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? sorted.filter((p) =>
        `${p.setName} ${p.set} ${p.collectorNumber} ${p.labels.join(' ')}`.toLowerCase().includes(needle)
      )
    : sorted

  return (
    <div className="picker">
      {printings.length > 8 && (
        <input
          className="picker-filter"
          type="search"
          placeholder={`Filter ${printings.length} versions by set, number or tag…`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      <div className="picker-grid" role="listbox" aria-label="Card versions">
        {!needle && (
          <Tile
            printing={cheapest.printing}
            price={cheapest.unitPrice}
            title="Cheapest version"
            subtitle={cheapest.printing ? `now ${cheapest.printing.set.toUpperCase()} #${cheapest.printing.collectorNumber}` : 'no price data'}
            selected={selected === AUTO}
            onClick={() => onSelect(AUTO)}
            onDoubleClick={onConfirm}
            auto
          />
        )}
        {shown.map((printing) => (
          <Tile
            key={printing.id}
            printing={printing}
            price={priceOf(printing, foil, priceBasis)}
            title={printing.setName}
            subtitle={`${printing.set.toUpperCase()} #${printing.collectorNumber} · ${printing.releasedAt.slice(0, 4)}`}
            selected={selected === printing.id}
            onClick={() => onSelect(printing.id)}
            onDoubleClick={onConfirm}
          />
        ))}
        {shown.length === 0 && <p className="muted">No versions match “{filter}”.</p>}
      </div>
    </div>
  )
}

interface TileProps {
  printing: Printing | null
  price: number | null
  title: string
  subtitle: string
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  auto?: boolean
}

function Tile({ printing, price, title, subtitle, selected, onClick, onDoubleClick, auto }: TileProps) {
  const image = printing?.imageNormal ?? printing?.imageSmall
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`tile${selected ? ' selected' : ''}${auto ? ' auto' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      {...previewHandlers({ src: printing?.imageNormal })}
    >
      <div className="tile-image">{image ? <img src={image} alt="" loading="lazy" /> : <span>No image</span>}</div>
      <div className="tile-price">{formatEur(price)}</div>
      <div className="tile-title">{title}</div>
      <div className="tile-sub">{subtitle}</div>
      {!auto && printing && printing.labels.length > 0 && (
        <div className="chips">
          {printing.labels.map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
