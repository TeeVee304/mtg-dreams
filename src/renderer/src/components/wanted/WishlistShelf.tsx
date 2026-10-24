import { useEffect, useMemo, useRef, useState } from 'react'
import { listColor } from '@shared/listColor'
import type { InventoryItem } from '@shared/types'
import { ui } from '@shared/text'
import { useCopyPool } from '../../hooks/useCopyPool'
import { formatEur } from '../../lib/format'
import { listFigures } from '../../lib/listFigures'
import { useBaselines } from '../../stores/history'
import type { CardList, ListRef } from '../../stores/library'
import { usePrintingsVersion } from '../../stores/printings'
import { useSettings } from '../../stores/settings'
import { Icon } from '../Icon'
import { PriceMoves } from '../PriceMoves'

/** Props of {@link WishlistShelf}. */
interface WishlistShelfProps {
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  onOpenList: (list: ListRef) => void
}

/**
 * Which ends of a sideways scroller have more to show, kept up to date as it scrolls or resizes.
 * @param items - What it holds; measured again when it changes.
 */
function useScrollEnds(items: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ before: false, after: false })
  const measure = () => {
    const el = ref.current
    if (!el) return
    const before = el.scrollLeft > 1
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEnds((was) => (was.before === before && was.after === after ? was : { before, after }))
  }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [items])
  /** Scrolls most of a view's width toward `direction` (-1 back, 1 on). */
  const page = (direction: -1 | 1) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return { ref, ends, measure, page }
}

/**
 * Most Wanted's shelf: the unfinished wishlists by what they still cost, cheapest to finish first,
 * each with its art, progress and price changes. Opens the list on click.
 */
export function WishlistShelf({ lists, inventory, onOpenList }: WishlistShelfProps) {
  const settings = useSettings()
  const baselines = useBaselines()
  const pool = useCopyPool(lists)
  const version = usePrintingsVersion()
  const shelf = useMemo(
    () =>
      lists
        .filter((list) => list.kind === 'wishlist')
        .map((list) => ({ list, figures: listFigures(list, inventory, settings, baselines, pool) }))
        .filter(({ figures: { summary } }) => summary.cards > 0 && summary.ownedCards < summary.cards)
        .sort((a, b) => a.figures.summary.neededValue - b.figures.summary.neededValue),
    // `version` stands for the prices the figures are read from.
    [lists, inventory, settings, baselines, pool, version]
  )
  const { ref, ends, measure, page } = useScrollEnds(shelf.length)
  if (shelf.length === 0) return null

  return (
    <section className="wishlist-shelf" aria-labelledby="shelf-title">
      <h2 id="shelf-title" className="section-heading">{ui.wanted.shelf.title}</h2>
      <div className={`shelf-scroller${ends.before ? ' more-before' : ''}${ends.after ? ' more-after' : ''}`}>
      {ends.before && (
        <button type="button" className="shelf-arrow before" onClick={() => page(-1)} aria-label={ui.wanted.shelf.earlier} title={ui.wanted.shelf.earlier}>
          <Icon name="chevron" />
        </button>
      )}
      <div className="shelf-grid" ref={ref} onScroll={measure}>
        {shelf.map(({ list, figures: { summary, cheaper, pricier, art } }) => {
          const collected = Math.round((summary.ownedCards / summary.cards) * 100)
          return (
            <button
              key={list.name}
              type="button"
              className="shelf-card"
              data-color={listColor(list.lines) ?? undefined}
              onClick={() => onOpenList({ kind: 'wishlist', name: list.name })}
              title={ui.wanted.shelf.collected(list.name, summary.ownedCards, summary.cards)}
            >
              <span className="shelf-art" aria-hidden="true">
                {art && settings.cardImages ? <img src={art} alt="" loading="lazy" draggable={false} /> : list.name.slice(0, 1)}
              </span>
              <span className="shelf-body">
                <span className="shelf-name">
                  {list.name}
                </span>
                <span className="shelf-progress" aria-hidden="true">
                  <span style={{ width: `${Math.max(collected, 2)}%` }} />
                </span>
                <span className="shelf-figures">
                  <span className="shelf-cost">{summary.loading > 0 ? '…' : formatEur(summary.neededValue)}</span>
                  <PriceMoves cheaper={cheaper} pricier={pricier} className="shelf-moves" />
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {ends.after && (
        <button type="button" className="shelf-arrow after" onClick={() => page(1)} aria-label={ui.wanted.shelf.more} title={ui.wanted.shelf.more}>
          <Icon name="chevron" />
        </button>
      )}
      </div>
    </section>
  )
}
