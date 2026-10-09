import { bundledBasic } from '@shared/basics'
import type { WantedCard } from '@shared/wanted'
import type { WantedOverview } from '../../lib/wanted'
import type { ListRef } from '../../stores/library'
import { NameCell, Price } from '../CardCells'
import { BoughtButton, ListChips, type ListMeta } from './parts'

/** Props of {@link BasicsTab}. */
interface BasicsTabProps {
  overview: WantedOverview
  /** Basic lands to buy, most first. */
  basics: WantedCard[]
  separate: boolean
  bundleBasics: boolean
  meta: Map<string, ListMeta>
  onBought: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
}

/** Basic lands tab: the basic lands lists still need, kept out of the Cards tab and of completion. */
export function BasicsTab({ overview, basics, separate, bundleBasics, meta, onBought, onOpenList }: BasicsTabProps) {
  if (basics.length === 0) {
    return (
      <div className="empty">
        <p>No basic lands needed.</p>
      </div>
    )
  }
  return (
    <>
      <p className="muted small wanted-note">
        Basic lands your {separate ? 'lists' : 'wishlists'} still need. They're left out of Cards and of list completion
        {bundleBasics ? '; bundled basic lands count as free (Settings).' : '.'}
      </p>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Wanted in</th>
            <th className="col-num">To buy</th>
            <th className="col-num">Cost</th>
            <th className="col-actions" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {basics.map((card) => (
            <tr key={card.key}>
              <NameCell images={overview.printingOf(card)} name={card.name}>
                <span className="card-name">{card.name}</span>
              </NameCell>
              <td>
                <ListChips lists={card.lists} meta={meta} onOpenList={onOpenList} />
              </td>
              <td className="col-num">{card.toBuy}</td>
              <td className="col-num">
                <Price unit={overview.unitOf(card)} qty={card.toBuy} free={!!bundledBasic(card.name, bundleBasics)} />
              </td>
              <td className="col-actions">
                <BoughtButton card={card} onBought={onBought} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
