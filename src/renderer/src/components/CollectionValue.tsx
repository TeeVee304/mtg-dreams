import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { bundledBasic } from '@shared/basics'
import { savedCardImage } from '@shared/images'
import { priceBasisLabel } from '@shared/pricing'
import type { InventoryItem } from '@shared/types'
import { ui } from '@shared/text'
import { inventoryValue, VALUATION_BASIS } from '../lib/collection'
import { formatEur } from '../lib/format'
import { prefersReducedMotion } from '../lib/motion'
import { requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { previewHandlers } from './HoverPreview'
import { Modal } from './Modal'
import { ValueChange } from './ValueChange'

/** Top-card list page size and stagger cycle. */
const STEP = 5

/** Animates toward `target` from the current value; jumps if reduced motion is requested. @returns Current animated value. */
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

/** Props of {@link CollectionValueDialog}. */
interface CollectionValueDialogProps {
  inventory: Map<string, InventoryItem>
  onClose: () => void
}

/** Inventory valuation dialog (see {@link inventoryValue}) with top cards; requests missing prices on open. */
export function CollectionValueDialog({ inventory, onClose }: CollectionValueDialogProps) {
  usePrintingsVersion()
  const { bundleBasics } = useSettings()
  const [shown, setShown] = useState(STEP)

  useEffect(() => {
    for (const item of inventory.values()) {
      if (!bundledBasic(item.name, bundleBasics)) requestPrintings(item.name, { priority: 'high' })
    }
  }, [inventory, bundleBasics])

  const items = [...inventory.values()]
  const { total, copies, pending, unpriced, valued: copiesValued } = inventoryValue(inventory, bundleBasics)
  const valued = [...copiesValued].sort((a, b) => b.unit - a.unit || b.unit * b.qty - a.unit * a.qty)
  const displayed = useCountUp(total)
  const priced = items.length - pending

  return (
    <Modal title={ui.value.title} onClose={onClose} size="medium">
      {items.length === 0 ? (
        <p className="muted">{ui.value.empty}</p>
      ) : (
        <>
          <div className="value-hero">
            <span className="value-total">{formatEur(displayed)}</span>
            <span className="muted small">{ui.value.totals(items.length, copies)}</span>
            {pending > 0 && (
              <>
                <div className="value-progress" aria-hidden="true">
                  <div style={{ width: `${Math.round((priced / items.length) * 100)}%` }} />
                </div>
                <span className="muted tiny">{ui.value.pricing(pending)}</span>
              </>
            )}
          </div>

          <ValueChange valued={valued} ready={pending === 0} />

          {valued.length > 0 && (
            <>
              <h3 className="value-heading">{ui.value.mostValuable}</h3>
              <ol className="value-list">
                {valued.slice(0, shown).map((card, index) => (
                  <li
                    key={`${card.name}|${card.copy.set ?? ''}|${card.copy.collector ?? ''}|${card.copy.foil}`}
                    className={`value-row rank-${index + 1}`}
                    style={{ '--stagger': `${(index % STEP) * 45}ms` } as CSSProperties}
                    {...previewHandlers({ src: card.printing?.imageNormal, back: card.printing?.imageBack })}
                  >
                    <span className="value-rank">{index + 1}</span>
                    {card.printing?.imageSmall ? (
                      <img className="value-thumb" src={savedCardImage(card.printing.imageSmall)} alt="" loading="lazy" />
                    ) : (
                      <span className="value-thumb" />
                    )}
                    <span className="value-name">
                      <span>{card.name}</span>
                      {card.printing && (
                        <span className="muted tiny">
                          {card.printing.set.toUpperCase()} #{card.printing.collectorNumber}
                          {card.copy.foil && ui.value.foil}
                          {!card.copy.set && ui.value.cheapest}
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
                  {ui.value.showMore(Math.min(STEP, valued.length - shown))}
                </button>
              )}
            </>
          )}

          <p className="muted tiny value-note">{ui.value.note(priceBasisLabel(VALUATION_BASIS), bundleBasics, unpriced)}</p>
        </>
      )}
    </Modal>
  )
}
