import { cardCount } from '../lib/format'

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
  const parts = [cheaper > 0 && `${cardCount(cheaper)} cheaper`, pricier > 0 && `${cardCount(pricier)} pricier`].filter(Boolean)
  return (
    <span className={`price-moves${className ? ` ${className}` : ''}`} title={`${parts.join(', ')} than when added`}>
      {cheaper > 0 && <span className="move-down">↓ {cheaper}</span>}
      {pricier > 0 && <span className="move-up">↑ {pricier}</span>}
    </span>
  )
}
