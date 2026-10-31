import type { DeckSizeCheck } from '@shared/formats'
import { priceBasisLabel } from '@shared/pricing'
import type { PriceBasis } from '@shared/types'
import { ui } from '@shared/text'
import { formatEur } from '../lib/format'
import type { Summary } from '../lib/summary'
import { SummaryItem as Item } from './SummaryItem'

/** Props of {@link ListValueCards}. */
interface ListValueCardsProps {
  isDeck: boolean
  /** A brew: what building it would take, not what is wanted. */
  brew?: boolean
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
  /** Main deck copies on the Game Changer list. */
  gameChangers: number
  basis: PriceBasis
}

/**
 * One-line value summary above a list: deck value and size, or a wishlist's remaining cost and
 * collected share (with the owned value once something is owned); for a brew, what building it would
 * cost and how much of it you own.
 */
export function ListValueCards({ isDeck, brew, summary, mainCards, size, target, lands, sideboard, gameChangers, basis }: ListValueCardsProps) {
  const text = ui.list.figures
  if (isDeck) {
    const makeup = [
      size?.note,
      text.makeup(lands, mainCards - lands),
      gameChangers > 0 && text.gameChangers(gameChangers),
      sideboard > 0 && text.sideboard(sideboard)
    ]
    const filled = target ? Math.min(100, Math.round((mainCards / target) * 100)) : 0
    return (
      <section className="summary-strip">
        <Item label={brew ? text.cost : text.deckValue} value={formatEur(summary.total)} accent note={priceNote(summary, basis)} />
        <Item
          label={text.cards}
          value={size?.label ?? String(mainCards)}
          warn={size !== null && size.status !== 'ok'}
          note={makeup.filter(Boolean).join(' · ')}
        >
          {size && target && (
            <div className={`progress${size.status === 'over' ? ' over' : ''}`} aria-label={text.ofCards(mainCards, target)}>
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
      <Item label={brew ? text.toBuild : text.stillNeeded} value={formatEur(summary.neededValue)} accent note={priceNote(summary, basis)} />
      <Item
        label={brew ? text.youOwn : text.collected}
        value={`${summary.ownedCards} / ${summary.cards}`}
        note={summary.ownedCards > 0 ? text.ownedValue(formatEur(summary.ownedValue), formatEur(summary.total)) : undefined}
      >
        <div className="progress" aria-label={text.percentCollected(progress)}>
          <div style={{ width: `${progress}%` }} />
        </div>
      </Item>
    </section>
  )
}

/** @returns Note naming the price basis and any loading or unpriced cards. */
function priceNote(summary: Summary, basis: PriceBasis): string {
  const text = ui.list.figures
  const parts = [text.prices(priceBasisLabel(basis))]
  if (summary.loading) parts.push(text.loading(summary.loading))
  if (summary.unpriced) parts.push(text.unpriced(summary.unpriced))
  return parts.join(' · ')
}
