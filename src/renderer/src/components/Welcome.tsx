import type { ListKind } from '@shared/types'
import { ui } from '@shared/text'

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
        <h1>{ui.welcome.title}</h1>
        <p className="muted">{ui.welcome.startWithCollection}</p>
        <div className="welcome-actions">
          <button type="button" className="primary" onClick={onPaste}>
            {ui.welcome.pasteCollection}
          </button>
          <button type="button" onClick={onAddPrecon}>
            {ui.welcome.addPrecon}
          </button>
        </div>
        <p className="muted small">
          {ui.welcome.planFirst}{' '}
          <button type="button" className="link-btn" onClick={() => onNew('deck')}>
            {ui.welcome.newDeck}
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={() => onNew('wishlist')}>
            {ui.welcome.newWishlist}
          </button>{' '}
          ·{' '}
          <button type="button" className="link-btn" onClick={onWizard}>
            {ui.welcome.wizardCommander}
          </button>
        </p>
      </div>
    )
  }
  return (
    <div className="empty welcome">
      <h1>{ui.welcome.title}</h1>
      <p className="muted">{ui.welcome.buildFrom(owned)}</p>
      <div className="welcome-actions">
        <button type="button" className="primary" onClick={() => onNew('deck')}>
          {ui.welcome.newDeck}
        </button>
        <button type="button" onClick={() => onNew('wishlist')}>
          {ui.welcome.newWishlist}
        </button>
      </div>
      <p className="muted small">
        {ui.welcome.newToCommander}{' '}
        <button type="button" className="link-btn" onClick={onWizard}>
          {ui.welcome.wizardWithYou}
        </button>
      </p>
    </div>
  )
}
