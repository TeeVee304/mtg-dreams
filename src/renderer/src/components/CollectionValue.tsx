import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { bundledBasic } from '../../../shared/basics'
import { priceBasisLabel } from '../../../shared/pricing'
import type { InventoryItem } from '../../../shared/types'
import { VALUATION_BASIS, valueCollection } from '../collection'
import { formatEur } from '../format'
import { prefersReducedMotion } from '../motion'
import { requestPrintings, usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'
import { previewHandlers } from './HoverPreview'
import { Modal } from './Modal'
import { ValueChange } from './ValueChange'

const STEP = 5

/** Animates a number towards `target`, continuing from wherever it currently is. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0)
  const current = useRef(0)
  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      current.current = from + (target - from) * (1 - Math.pow(1 - t, 3))
      setValue(current.current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return value
}

interface CollectionValueDialogProps {
  inventory: Map<string, InventoryItem>
  onClose: () => void
}

/**
 * The inventory's estimated value and its most valuable cards, worked out each
 * time it opens: copies with a recorded version at that version, the others at
 * the card's cheapest version.
 */
export function CollectionValueDialog({ inventory, onClose }: CollectionValueDialogProps) {
  usePrintingsVersion()
  const { bundleBasics } = useSettings()
  const [shown, setShown] = useState(STEP)

  // Cached prices answer instantly; anything missing is looked up now.
  useEffect(() => {
    for (const item of inventory.values()) {
      if (!bundledBasic(item.name, bundleBasics)) requestPrintings(item.name, { priority: 'high' })
    }
  }, [inventory, bundleBasics])

  const items = [...inventory.values()]
  const { total, copies, pending, unpriced, valued } = valueCollection(inventory, VALUATION_BASIS, bundleBasics)
  valued.sort((a, b) => b.unit - a.unit || b.unit * b.qty - a.unit * a.qty)
  const displayed = useCountUp(total)
  const priced = items.length - pending

  return (
    <Modal title="Inventory Value" onClose={onClose} size="medium">
      {items.length === 0 ? (
        <p className="muted">Your inventory is empty. Add cards or a precon you own to see what it's worth.</p>
      ) : (
        <>
          <div className="value-hero">
            <span className="value-total">{formatEur(displayed)}</span>
            <span className="muted small">
              {items.length} unique cards · {copies} copies
            </span>
            {pending > 0 && (
              <>
                <div className="value-progress" aria-hidden="true">
                  <div style={{ width: `${Math.round((priced / items.length) * 100)}%` }} />
                </div>
                <span className="muted tiny">
                  Pricing {pending} more {pending === 1 ? 'card' : 'cards'}…
                </span>
              </>
            )}
          </div>

          <ValueChange valued={valued} ready={pending === 0} />

          {valued.length > 0 && (
            <>
              <h3 className="value-heading">Most valuable cards</h3>
              <ol className="value-list">
                {valued.slice(0, shown).map((card, index) => (
                  <li
                    key={`${card.name}|${card.copy.set ?? ''}|${card.copy.collector ?? ''}|${card.copy.foil}`}
                    className={`value-row rank-${index + 1}`}
                    style={{ '--stagger': `${(index % STEP) * 45}ms` } as CSSProperties}
                    {...previewHandlers({ src: card.printing?.imageNormal })}
                  >
                    <span className="value-rank">{index + 1}</span>
                    {card.printing?.imageSmall ? (
                      <img className="value-thumb" src={card.printing.imageSmall} alt="" loading="lazy" />
                    ) : (
                      <span className="value-thumb" />
                    )}
                    <span className="value-name">
                      <span>{card.name}</span>
                      {card.printing && (
                        <span className="muted tiny">
                          {card.printing.set.toUpperCase()} #{card.printing.collectorNumber}
                          {card.copy.foil && ' · foil'}
                          {!card.copy.set && ' · cheapest version'}
                        </span>
                      )}
                    </span>
                    <span className="value-unit">
                      {formatEur(card.unit)}
                      {card.qty > 1 && <span className="muted small"> × {card.qty}</span>}
                    </span>
                    <span className="value-sub">{formatEur(card.unit * card.qty)}</span>
                  </li>
                ))}
              </ol>
              {valued.length > shown && (
                <button type="button" className="value-more" onClick={() => setShown(shown + STEP)}>
                  Show {Math.min(STEP, valued.length - shown)} more
                </button>
              )}
            </>
          )}

          <p className="muted tiny value-note">
            Estimated at Cardmarket prices ({priceBasisLabel(VALUATION_BASIS)}): copies at the version you recorded,
            the rest at each card's cheapest version
            {bundleBasics ? '; bundled basic lands count as free' : ''}.
            {unpriced > 0 && ` ${unpriced} ${unpriced === 1 ? 'card has' : 'cards have'} no price and ${unpriced === 1 ? 'is' : 'are'} left out.`}
          </p>
        </>
      )}
    </Modal>
  )
}
