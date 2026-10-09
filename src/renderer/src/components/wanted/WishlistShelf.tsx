import { useMemo } from 'react'
import { listColor } from '@shared/listColor'
import { listPriority } from '@shared/listPriority'
import type { InventoryItem } from '@shared/types'
import { useCopyPool } from '../../hooks/useCopyPool'
import { formatEur } from '../../lib/format'
import { listFigures } from '../../lib/listFigures'
import { useBaselines } from '../../stores/history'
import type { CardList, ListRef } from '../../stores/library'
import { usePrintingsVersion } from '../../stores/printings'
import { useSettings } from '../../stores/settings'

/** Props of {@link WishlistShelf}. */
interface WishlistShelfProps {
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  onOpenList: (list: ListRef) => void
}

/**
 * Most Wanted's shelf: the unfinished wishlists by what they still cost, cheapest to finish first,
 * each with its art, progress and price drops. Opens the list on click.
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
  if (shelf.length === 0) return null

  return (
    <section className="wishlist-shelf" aria-labelledby="shelf-title">
      <h2 id="shelf-title">Wishlists by cost to finish</h2>
      <div className="shelf-grid">
        {shelf.map(({ list, figures: { summary, cheaper, art } }) => {
          const collected = Math.round((summary.ownedCards / summary.cards) * 100)
          const high = listPriority(list.lines) === 'high'
          return (
            <button
              key={list.name}
              type="button"
              className="shelf-card"
              data-color={listColor(list.lines) ?? undefined}
              onClick={() => onOpenList({ kind: 'wishlist', name: list.name })}
              title={`${list.name}: ${summary.ownedCards} of ${summary.cards} collected`}
            >
              <span className="shelf-art" aria-hidden="true">
                {art && settings.cardImages ? <img src={art} alt="" loading="lazy" draggable={false} /> : list.name.slice(0, 1)}
              </span>
              <span className="shelf-body">
                <span className="shelf-name">
                  {high && (
                    <span className="shelf-star" aria-label="High priority">
                      ★{' '}
                    </span>
                  )}
                  {list.name}
                </span>
                <span className="shelf-progress" aria-hidden="true">
                  <span style={{ width: `${Math.max(collected, 2)}%` }} />
                </span>
                <span className="shelf-figures">
                  <span className="shelf-cost">{summary.loading > 0 ? '…' : formatEur(summary.neededValue)}</span>
                  {cheaper > 0 && <span className="shelf-cheaper">↓ {cheaper}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
