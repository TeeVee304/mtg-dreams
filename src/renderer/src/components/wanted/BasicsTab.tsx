import { bundledBasic } from '@shared/basics'
import type { WantedCard } from '@shared/wanted'
import { ui } from '@shared/text'
import type { WantedOverview } from '../../lib/wanted'
import type { ListRef } from '../../stores/library'
import { NameCell, Price } from '../CardCells'
import { BoughtButton, ListChips, type ListMeta } from './parts'

/** Props of {@link BasicsTab}. */
interface BasicsTabProps {
  overview: WantedOverview
  /** Basic lands to buy, most first. */
  basics: WantedCard[]
  bundleBasics: boolean
  meta: Map<string, ListMeta>
  onBought: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
}

/** Basic lands tab: the basic lands lists still need, kept out of the Cards tab and of completion. */
export function BasicsTab({ overview, basics, bundleBasics, meta, onBought, onOpenList }: BasicsTabProps) {
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
