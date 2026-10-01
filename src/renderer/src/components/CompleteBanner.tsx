import { useState, type CSSProperties } from 'react'
import { prefersReducedMotion } from '../motion'
import { Icon } from './Icon'

const CONFETTI_COLORS = ['#e3a94f', '#5cc28a', '#7fb0ff', '#f0a58a', '#c4b5fd', '#f8f3d9']
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  angle: (360 / 18) * i + (i % 2 ? 8 : -8),
  distance: 56 + (i % 3) * 24,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 4) * 25
}))

// Long enough for the confetti to land before the view switches to the deck.
const CELEBRATION_MS = 750

interface CompleteBannerProps {
  cards: number
  onMove: () => Promise<void>
}

/** Shown on a wishlist once every card is owned. */
export function CompleteBanner({ cards, onMove }: CompleteBannerProps) {
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
        <strong>Wishlist complete!</strong>
        <span className="muted">
          You own all {cards} {cards === 1 ? 'card' : 'cards'}. Ready to become a deck?
        </span>
      </div>
      <div className="move-wrap">
        <button type="button" className="move-btn" onClick={move} disabled={moving}>
          {moving ? 'Moving…' : 'Move to Decks'}
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
