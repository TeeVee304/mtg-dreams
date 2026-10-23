import { useState, type CSSProperties } from 'react'
import { cardCount } from '../lib/format'
import { prefersReducedMotion } from '../lib/motion'
import { Icon } from './Icon'

const CONFETTI_COLORS = ['#e3a94f', '#5cc28a', '#7fb0ff', '#f0a58a', '#c4b5fd', '#f8f3d9']
/** Confetti piece geometry, color and delay. */
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  angle: (360 / 18) * i + (i % 2 ? 8 : -8),
  distance: 56 + (i % 3) * 24,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 4) * 25
}))

/** Delay before moving the list, letting the confetti land. */
const CELEBRATION_MS = 750

/** Props of {@link CompleteBanner}. */
interface CompleteBannerProps {
  /** Total copies in the list. */
  cards: number
  /** A brew, not a wishlist. */
  brew?: boolean
  /** Deck the wishlist upgrades; null for a plain wishlist. */
  upgrades: string | null
  /** Moves the wishlist to decks, or applies the upgrade to its deck. */
  onMove: () => Promise<void>
}

/** Banner on a fully owned wishlist or brew offering to move it to decks, or apply it to the deck it upgrades, with confetti. */
export function CompleteBanner({ cards, brew, upgrades, onMove }: CompleteBannerProps) {
  const [moving, setMoving] = useState(false)

  const move = async () => {
    if (moving) return
    setMoving(true)
    if (!prefersReducedMotion()) await new Promise((resolve) => setTimeout(resolve, CELEBRATION_MS))
    try {
      await onMove()
    } catch {
      setMoving(false)
    }
  }

  return (
    <section className={`complete-banner${moving ? ' moving' : ''}`} aria-live="polite">
      <span className="complete-check" aria-hidden="true">
        <Icon name="check" />
      </span>
      <div className="complete-text">
        <strong>{upgrades ? 'Upgrade complete!' : brew ? 'Brew complete!' : 'Wishlist complete!'}</strong>
        <span className="muted">
          You own all {cardCount(cards)}.{' '}
          {upgrades ? `Ready to apply it to “${upgrades}”?` : 'Ready to become a deck?'}
        </span>
      </div>
      <div className="move-wrap">
        <button type="button" className="move-btn" onClick={move} disabled={moving}>
          {upgrades ? (moving ? 'Applying…' : 'Apply upgrade') : moving ? 'Moving…' : 'Move to Decks'}
          <Icon name="arrow" />
        </button>
        {moving && (
          <span className="confetti" aria-hidden="true">
            {PIECES.map((piece, i) => (
              <i
                key={i}
                style={
                  {
                    '--angle': `${piece.angle}deg`,
                    '--distance': `${piece.distance}px`,
                    '--color': piece.color,
                    '--delay': `${piece.delay}ms`
                  } as CSSProperties
                }
              />
            ))}
          </span>
        )}
      </div>
    </section>
  )
}
