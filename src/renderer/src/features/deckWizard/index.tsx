import { lazy, Suspense, type ComponentProps } from 'react'
import { WizardHat } from './WizardHat'
import './hat.css'

/**
 * The Deck Wizard's entry points: the only module the rest of the renderer imports. The wizard
 * itself loads when first opened; it talks to the main process through `window.deckWizard` alone.
 *
 * @packageDocumentation
 */

const DeckWizard = lazy(() => import('./DeckWizard').then((module) => ({ default: module.DeckWizard })))

/** The Deck Wizard popup, loaded on first use. */
export function DeckWizardDialog(props: ComponentProps<typeof DeckWizard>) {
  return (
    <Suspense fallback={null}>
      <DeckWizard {...props} />
    </Suspense>
  )
}

/** Props of {@link DeckWizardNavItem}. */
interface DeckWizardNavItemProps {
  onOpen: () => void
  /** The wizard is open; the item shines. */
  open: boolean
  /** The sidebar is a narrow rail, showing icons only. */
  rail: boolean
}

/** The sidebar item that opens the Deck Wizard, with its hat. */
export function DeckWizardNavItem({ onOpen, open, rail }: DeckWizardNavItemProps) {
  return (
    <button
      type="button"
      className={`nav-item hat-host${open ? ' wizard-open' : ''}`}
      title={rail ? 'Deck Wizard: plan a Commander deck' : undefined}
      onClick={onOpen}
    >
      <span className="nav-thumb nav-tile nav-tile-foil" aria-hidden="true">
        <WizardHat />
      </span>
      <span className="nav-text">
        <span className="nav-name">Deck Wizard</span>
        <span className="nav-meta">Plan a Commander deck</span>
      </span>
    </button>
  )
}
