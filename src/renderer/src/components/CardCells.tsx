import type { ReactNode } from 'react'
import type { ThemeColor } from '@shared/themes'
import type { Printing } from '@shared/types'
import { formatEur } from '../lib/format'
import { previewHandlers } from './HoverPreview'
import { Icon } from './Icon'
import { CardThumb, Skeleton } from './Placeholders'

/**
 * Building blocks of the card tables (lists, inventory, Most Wanted, trades).
 *
 * @packageDocumentation
 */

/** Props of {@link Price}. */
interface PriceProps {
  /** EUR unit price: undefined while loading, null without a Cardmarket price. */
  unit: number | null | undefined
  /** Copies priced; with more than one, the unit price shows below the total. */
  qty?: number
  /** Total when it is not `unit × qty`, e.g. versions priced differently. */
  total?: number
  /** Bundled basic land: free of charge. */
  free?: boolean
  title?: string
}

/** Price cell content: total in bold with the unit price below; a placeholder while loading, `—` without a price. */
export function Price({ unit, qty = 1, total, free, title }: PriceProps) {
  if (free) {
    return (
      <span className="muted" title="Bundled basic lands count as free">
        Free
      </span>
    )
  }
  if (total === undefined && unit === undefined) return <Skeleton width={52} />
  if (total === undefined && unit === null) {
    return (
      <span className="muted" title={title ?? 'No Cardmarket price'}>
        —
      </span>
    )
  }
  return (
    <span className="value-cell" title={title}>
      <strong>{formatEur(total ?? unit! * qty)}</strong>
      {qty > 1 && typeof unit === 'number' && <span className="muted small">{formatEur(unit)} each</span>}
    </span>
  )
}

/** Props of {@link NameCell}. */
interface NameCellProps {
  /** Printing or token pictured: thumbnail, and the card shown on hover. */
  images: Pick<Printing, 'imageSmall' | 'imageNormal' | 'imageBack'> | null | undefined
  /** Card previewed on hover while `images` is unknown. */
  name?: string
  /** Shimmers the thumbnail. */
  loading?: boolean
  /** Name and the chips and notes below it. */
  children: ReactNode
}

/** Card table name cell: art thumbnail beside the name; hovering shows the card. */
export function NameCell({ images, name, loading, children }: NameCellProps) {
  return (
    <td className="col-name" {...previewHandlers({ src: images?.imageNormal, back: images?.imageBack, name })}>
      <div className="name-cell">
        <CardThumb src={images?.imageSmall} loading={loading} />
        <div className="name-main">{children}</div>
      </div>
    </td>
  )
}

/** Button opening a card's Cardmarket page: an icon, or `labeled` with its text; disabled without a page. */
export function CardmarketButton({ url, labeled }: { url: string | null | undefined; labeled?: boolean }) {
  const open = () => url && window.api.openExternal(url)
  if (labeled) {
    return (
      <button type="button" disabled={!url} onClick={open}>
        Open on Cardmarket <Icon name="external" />
      </button>
    )
  }
  return (
    <button type="button" className="icon-btn" disabled={!url} onClick={open} title="Open on Cardmarket" aria-label="Open on Cardmarket">
      <Icon name="external" />
    </button>
  )
}

/** Props of {@link ListChip}. */
interface ListChipProps {
  /** List color; null for the app accent. */
  color: ThemeColor | null
  onClick: () => void
  title?: string
  /** Extra classes: `low` (low priority), `short` (deck short of copies). */
  className?: string
  children: ReactNode
}

/** Chip in a list's color, opening that list. */
export function ListChip({ color, onClick, title, className, children }: ListChipProps) {
  return (
    <button
      type="button"
      className={`chip link list-chip${className ? ` ${className}` : ''}`}
      data-color={color ?? undefined}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  )
}
