import type { DeckSizeCheck } from '@shared/formats'
import { priceBasisLabel } from '@shared/pricing'
import type { PriceBasis } from '@shared/types'
import { formatEur } from '../lib/format'
import type { Summary } from '../lib/summary'
import { SummaryItem as Item } from './SummaryItem'

/** Props of {@link ListValueCards}. */
interface ListValueCardsProps {
  isDeck: boolean
  summary: Summary
  /** Main deck copies (sideboard aside). */
  mainCards: number
  /** Decks with a format: main deck size against it. */
  size: DeckSizeCheck | null
  /** Decks with a format: the size it asks for. */
  target: number | null
  /** Main deck land copies. */
  lands: number
  /** Sideboard copies. */
  sideboard: number
  basis: PriceBasis
}

/**
 * One-line value summary above a list: deck value and size, or a wishlist's remaining cost and
 * collected share (with the owned value once something is owned).
 */
export function ListValueCards({ isDeck, summary, mainCards, size, target, lands, sideboard, basis }: ListValueCardsProps) {
  if (isDeck) {
    const makeup = [size?.note, `${lands} lands · ${mainCards - lands} nonland`, sideboard > 0 && `${sideboard} sideboard`]
    const filled = target ? Math.min(100, Math.round((mainCards / target) * 100)) : 0
    return (
      <section className="summary-strip">
        <Item label="Deck value" value={formatEur(summary.total)} accent note={priceNote(summary, basis)} />
        <Item
          label="Cards"
          value={size?.label ?? String(mainCards)}
          warn={size !== null && size.status !== 'ok'}
          note={makeup.filter(Boolean).join(' · ')}
        >
          {size && target && (
            <div className={`progress${size.status === 'over' ? ' over' : ''}`} aria-label={`${mainCards} of ${target} cards`}>
              <div style={{ width: `${filled}%` }} />
            </div>
          )}
        </Item>
      </section>
    )
  }
  const progress = summary.cards ? Math.round((summary.ownedCards / summary.cards) * 100) : 0
  return (
    <section className="summary-strip">
      <Item label="Still needed" value={formatEur(summary.neededValue)} accent note={priceNote(summary, basis)} />
      <Item
        label="Collected"
        value={`${summary.ownedCards} / ${summary.cards}`}
        note={summary.ownedCards > 0 ? `${formatEur(summary.ownedValue)} owned of ${formatEur(summary.total)}` : undefined}
      >
        <div className="progress" aria-label={`${progress}% collected`}>
          <div style={{ width: `${progress}%` }} />
        </div>
      </Item>
    </section>
  )
}

/** @returns Note naming the price basis and any loading or unpriced cards. */
function priceNote(summary: Summary, basis: PriceBasis): string {
  const parts = [`${priceBasisLabel(basis)} prices`]
  if (summary.loading) parts.push(`${summary.loading} loading`)
  if (summary.unpriced) parts.push(`${summary.unpriced} without price`)
  return parts.join(' · ')
}
