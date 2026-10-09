import type { ListKind } from '@shared/types'
import { cardCount } from '../lib/format'

/** Props of {@link Welcome}. */
interface WelcomeProps {
  /** Cards in the inventory. */
  owned: number
  onPaste: () => void
  onAddPrecon: () => void
  onNew: (kind: ListKind) => void
  onWizard: () => void
}

/** The page shown with no list open: adding the collection first, or starting a deck. */
export function Welcome({ owned, onPaste, onAddPrecon, onNew, onWizard }: WelcomeProps) {
  if (owned === 0) {
    return (
      <div className="empty welcome">
        <h1>Welcome to MTG Dreams</h1>
        <p className="muted">Decks are built from the cards you own, so start by adding your collection.</p>
        <div className="welcome-actions">
          <button type="button" className="primary" onClick={onPaste}>
            Paste your collection
          </button>
          <button type="button" onClick={onAddPrecon}>
            Add a precon you own
          </button>
        </div>
        <p className="muted small">
          Or plan first:{' '}
          <button type="button" className="link-btn" onClick={() => onNew('deck')}>
            New deck
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={() => onNew('wishlist')}>
            New wishlist
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={onWizard}>
            Let the Deck Wizard plan a Commander deck
          </button>
        </p>
      </div>
    )
  }
  return (
    <div className="empty welcome">
      <h1>Welcome to MTG Dreams</h1>
      <p className="muted">Build a deck from the {cardCount(owned)} you own, or plan one with a wishlist.</p>
      <div className="welcome-actions">
        <button type="button" className="primary" onClick={() => onNew('deck')}>
          New deck
        </button>
        <button type="button" onClick={() => onNew('wishlist')}>
          New wishlist
        </button>
      </div>
      <p className="muted small">
        New to Commander?{' '}
        <button type="button" className="link-btn" onClick={onWizard}>
          Let the Deck Wizard plan a deck with you
        </button>
      </p>
    </div>
  )
}
