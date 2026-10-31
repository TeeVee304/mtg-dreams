import type { ReactNode } from 'react'
import type { ThemeColor } from '@shared/themes'
import type { LocalizedQuery, Printing } from '@shared/types'
import { ui } from '@shared/text'
import { formatEur } from '../lib/format'
import { previewHandlers } from './HoverPreview'
import { Icon } from './Icon'
import { CardThumb, Skeleton } from './Placeholders'
import { openExternal } from '../lib/desktop'

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
      <span className="muted" title={ui.card.price.freeHint}>
        {ui.card.price.free}
      </span>
    )
  }
  if (total === undefined && unit === undefined) return <Skeleton width={52} />
  if (total === undefined && unit === null) {
    return (
      <span className="muted" title={title ?? ui.card.price.none}>
        —
      </span>
    )
  }
  return (
    <span className="value-cell" title={title}>
      <strong>{formatEur(total ?? unit! * qty)}</strong>
      {qty > 1 && typeof unit === 'number' && <span className="muted small">{ui.card.price.each(formatEur(unit))}</span>}
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
  /** A foil copy: its thumbnail and preview have a sheen. */
  foil?: boolean
  /** Copies in another language: the preview shows that language's printing. */
  localized?: LocalizedQuery
  /** Name and the chips and notes below it. */
  children: ReactNode
}

/** Card table name cell: art thumbnail beside the name; hovering shows the card. */
export function NameCell({ images, name, loading, foil, localized, children }: NameCellProps) {
  return (
    <td className="col-name" {...previewHandlers({ src: images?.imageNormal, back: images?.imageBack, name, foil, localized })}>
      <div className="name-cell">
        <CardThumb src={images?.imageSmall} loading={loading} foil={foil} />
        <div className="name-main">{children}</div>
      </div>
    </td>
  )
}

/** Button opening a card's Cardmarket page: an icon, or `labeled` with its text; disabled without a page. */
export function CardmarketButton({ url, labeled }: { url: string | null | undefined; labeled?: boolean }) {
  const open = () => url && openExternal(url)
  if (labeled) {
    return (
      <button type="button" disabled={!url} onClick={open}>
        {ui.card.openCardmarket} <Icon name="external" />
      </button>
    )
  }
  return (
    <button type="button" className="icon-btn" disabled={!url} onClick={open} title={ui.card.openCardmarket} aria-label={ui.card.openCardmarket}>
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
  /** Extra classes: `short` (deck short of copies). */
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
