import { ui } from '@shared/text'

/** Props of {@link PriceMoves}. */
interface PriceMovesProps {
  /** Still-needed cards cheaper than when added. */
  cheaper: number
  /** Still-needed cards pricier than when added. */
  pricier: number
  className?: string
}

/**
 * A wishlist's price moves since its cards were added, compactly: a green `↓ n` for cards that got
 * cheaper and a red `↑ n` for cards that got pricier; nothing when neither happened.
 */
export function PriceMoves({ cheaper, pricier, className }: PriceMovesProps) {
  if (cheaper === 0 && pricier === 0) return null
  return (
    <span className={`price-moves${className ? ` ${className}` : ''}`} title={ui.prices.moves(cheaper, pricier)}>
      {cheaper > 0 && <span className="move-down">↓ {cheaper}</span>}
      {pricier > 0 && <span className="move-up">↑ {pricier}</span>}
    </span>
  )
}
