import { bundledBasic } from '@shared/basics'
import { orderedCopies, type OrderStamps } from '@shared/ordered'
import type { WantedCard } from '@shared/wanted'
import { ui } from '@shared/text'
import type { WantedOverview } from '../../lib/wanted'
import type { ListRef } from '../../stores/library'
import { NameCell, Price } from '../CardCells'
import { AcquiredStampMark, BoughtButton, ListChips, OrderStampMark, StampButton, type ListMeta, type StampMotion } from './parts'

/** Props of {@link BasicsTab}. */
interface BasicsTabProps {
  overview: WantedOverview
  /** Basic lands to buy, most first. */
  basics: WantedCard[]
  bundleBasics: boolean
  meta: Map<string, ListMeta>
  onBought: (card: WantedCard) => void
  /** Ordered stamps, by card key. */
  stamps: OrderStamps
  /** Today, `YYYY-MM-DD`. */
  today: string
  /** Cards just stamped: their stamp lands. */
  /** Stamps in motion. */
  motion: StampMotion
  onStamp: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
}

/** Basic lands tab: the basic lands lists still need, kept out of the Cards tab and of completion. */
export function BasicsTab({ overview, basics, bundleBasics, meta, onBought, stamps, today, motion, onStamp, onOpenList }: BasicsTabProps) {
  if (basics.length === 0) {
    return (
      <div className="empty">
        <p>{ui.wanted.basics.none}</p>
      </div>
    )
  }
  return (
    <>
      <p className="muted small wanted-note">{ui.wanted.basics.hint(bundleBasics)}</p>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>{ui.wanted.columns.card}</th>
            <th>{ui.wanted.columns.wantedIn}</th>
            <th className="col-num">{ui.wanted.columns.toBuy}</th>
            <th className="col-num">{ui.wanted.columns.cost}</th>
            <th className="col-actions" aria-label={ui.wanted.columns.actions} />
          </tr>
        </thead>
        <tbody>
          {basics.map((card) => {
            const stamp = stamps[card.key]
            const ordered = orderedCopies(card, stamps)
            const full = ordered > 0 && ordered >= card.toBuy
            const qty = full ? card.toBuy : card.toBuy - ordered
            const acquired = motion.acquiring.has(card.key)
            const undoing = motion.unacquiring.has(card.key)
            const lifting = motion.lifting.has(card.key)
            return (
              <tr key={card.key} className={acquired && !undoing ? 'is-acquired' : full ? 'is-ordered' : undefined}>
                <NameCell images={overview.printingOf(card)} name={card.name}>
                  <span className="card-name">{card.name}</span>
                </NameCell>
                <td className="stamp-cell">
                  <ListChips lists={card.lists} meta={meta} onOpenList={onOpenList} />
                  {stamp && full && (
                    <OrderStampMark stamp={stamp} qty={ordered} today={today} fresh={motion.landing.has(card.key)} lifting={lifting} dim={acquired && !undoing} />
                  )}
                  {acquired && <AcquiredStampMark qty={card.toBuy} today={today} lifting={undoing} />}
                </td>
                <td className="col-num">{qty}</td>
                <td className="col-num">
                  <Price unit={overview.unitOf(card)} qty={qty} free={!!bundledBasic(card.name, bundleBasics)} />
                </td>
                <td className="col-actions">
                  <StampButton card={card} stamped={full} onStamp={onStamp} disabled={acquired || lifting} />
                  <BoughtButton card={card} onBought={onBought} pressed={acquired && !undoing} disabled={undoing || lifting} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
