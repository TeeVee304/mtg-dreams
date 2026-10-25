import { filtersActive, needsCardData, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { heldWhere } from '@shared/listModel'
import type { CardInfo, ListKind } from '@shared/types'
import { WANTED_SORTS, type WantedCard, type WantedSort } from '@shared/wanted'
import { ui } from '@shared/text'
import type { WantedOverview } from '../../lib/wanted'
import type { PriceChange } from '../../stores/history'
import type { ListRef } from '../../stores/library'
import { CardmarketButton, NameCell, Price } from '../CardCells'
import { SortSelect } from '../Controls'
import { FilterBar } from '../FilterBar'
import { BoughtButton, ListChips, type ListMeta } from './parts'

/** Friends who have a card on their trade lists, with how many. */
export type FriendHaves = Map<string, Array<{ friend: string; qty: number }>>

/** How much a wanted card's price moved since it was added to a wishlist. */
export type CardPriceChange = Pick<PriceChange, 'direction' | 'percent'>

/** Props of {@link CardsTab}. */
interface CardsTabProps {
  overview: WantedOverview
  /** The cards shown, filtered and sorted. */
  visible: WantedCard[]
  /** Neither decks nor wishlists exist. */
  noLists: boolean
  filters: CardFilters
  onFilters: (filters: CardFilters) => void
  sort: WantedSort
  onSort: (sort: WantedSort) => void
  friends: FriendHaves
  /** Price change since added to a wishlist, by card key. */
  changes: Map<string, CardPriceChange>
  pool: CopyPool
  meta: Map<string, ListMeta>
  infoOf: (card: WantedCard) => CardInfo | null | undefined
  onBought: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
  onOpenTrade: (friend: string) => void
  onNew: (kind: ListKind) => void
}

/** Cards tab: the cards lists still miss, with price changes, friends who have them, and Bought. */
export function CardsTab(props: CardsTabProps) {
  const { overview, visible, noLists, filters, friends, changes, pool, meta } = props
  if (noLists) {
    return (
      <div className="empty">
        <p>{ui.wanted.noLists}</p>
        <p className="muted">{ui.wanted.noListsHint}</p>
        <div className="welcome-actions">
          <button type="button" onClick={() => props.onNew('deck')}>
            {ui.wanted.newDeck}
          </button>
          <button type="button" onClick={() => props.onNew('wishlist')}>
            {ui.wanted.newWishlist}
          </button>
        </div>
      </div>
    )
  }
  if (overview.cards.length === 0) {
    return (
      <div className="empty">
        <p>{ui.wanted.nothingToBuy}</p>
        <p className="muted">{ui.wanted.nothingToBuyHint}</p>
      </div>
    )
  }
  return (
    <>
      <FilterBar
        filters={filters}
        onChange={props.onFilters}
        namePlaceholder={ui.wanted.filterByName}
        loadingNote={needsCardData(filters) && overview.cards.some((card) => props.infoOf(card) === undefined) ? ui.wanted.loadingCardData : undefined}
        end={<SortSelect value={props.sort} options={WANTED_SORTS.map((id) => ({ id, ...ui.wantedSorts[id] }))} onChange={props.onSort} />}
      >
        {filtersActive(filters) && (
          <span className="muted small">{ui.wanted.showing(visible.length, overview.cards.length)}</span>
        )}
      </FilterBar>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>{ui.wanted.columns.card}</th>
            <th>{ui.wanted.columns.wantedIn}</th>
            <th className="col-num" title={ui.wanted.toBuyHint}>
              {ui.wanted.columns.toBuy}
            </th>
            <th className="col-num">{ui.wanted.columns.cost}</th>
            <th className="col-actions" aria-label={ui.wanted.columns.actions} />
          </tr>
        </thead>
        <tbody>
          {visible.map((card) => {
            const unit = overview.unitOf(card)
            const printing = overview.printingOf(card)
            const change = changes.get(card.key)
            const haves = friends.get(card.key)
            const usedBy = card.owned > 0 ? pool.usedBy(card.key, card.owned) : []
            return (
              <tr key={card.key}>
                <NameCell images={printing} name={card.name} loading={unit === undefined}>
                  <span className="card-name" title={card.name}>
                    {card.name}
                  </span>
                  {card.completes.length > 0 && (
                    <span className="chip completes-chip" title={ui.wanted.completesHint}>
                      {ui.wanted.completes(card.completes.map((list) => list.name).join(', '))}
                    </span>
                  )}
                  {change &&
                    (change.direction === 'down' ? (
                      <span className="chip cheaper" title={ui.wanted.cheaperHint}>
                        {ui.wanted.cheaper(change.percent)}
                      </span>
                    ) : (
                      <span className="chip pricier" title={ui.wanted.pricierHint}>
                        {ui.wanted.pricier(change.percent)}
                      </span>
                    ))}
                  {haves && (
                    <button
                      type="button"
                      className="chip link friend-chip"
                      onClick={() => props.onOpenTrade(haves[0].friend)}
                      title={haves.map((have) => ui.wanted.friendHas(have.friend, have.qty)).join('\n')}
                    >
                      {ui.wanted.friendsHaveIt(haves.map((have) => have.friend))}
                    </button>
                  )}
                  {card.owned > 0 && (
                    <span className="muted small owned-note">
                      {ui.wanted.owned(card.owned, usedBy.length > 0 ? heldWhere(usedBy, card.owned) : null)}
                    </span>
                  )}
                </NameCell>
                <td>
                  <ListChips lists={card.lists} meta={meta} onOpenList={props.onOpenList} />
                </td>
                <td className="col-num">{card.toBuy}</td>
                <td className="col-num">
                  <Price unit={unit} qty={card.toBuy} />
                </td>
                <td className="col-actions">
                  {printing?.cardmarketUrl && <CardmarketButton url={printing.cardmarketUrl} />}
                  <BoughtButton card={card} onBought={props.onBought} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {visible.length === 0 && <p className="muted empty-filter">{ui.wanted.noMatch}</p>}
    </>
  )
}
