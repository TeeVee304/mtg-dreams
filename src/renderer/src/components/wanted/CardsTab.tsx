import { filtersActive, needsCardData, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { heldWhere } from '@shared/listModel'
import type { CardInfo, ListKind } from '@shared/types'
import { WANTED_SORTS, type WantedCard, type WantedSort } from '@shared/wanted'
import type { WantedOverview } from '../../lib/wanted'
import type { ListRef } from '../../stores/library'
import { CardmarketButton, NameCell, Price } from '../CardCells'
import { SortSelect } from '../Controls'
import { FilterBar } from '../FilterBar'
import { BoughtButton, ListChips, type ListMeta } from './parts'

/** Friends who have a card on their trade lists, with how many. */
export type FriendHaves = Map<string, Array<{ friend: string; qty: number }>>

/** Props of {@link CardsTab}. */
interface CardsTabProps {
  overview: WantedOverview
  /** The cards shown, filtered and sorted. */
  visible: WantedCard[]
  /** Decks count, with separate copies. */
  separate: boolean
  /** Neither decks (with separate copies) nor wishlists exist. */
  noLists: boolean
  filters: CardFilters
  onFilters: (filters: CardFilters) => void
  sort: WantedSort
  onSort: (sort: WantedSort) => void
  /** Whether any friend shared a trade list, and the "a friend has it" filter. */
  hasTrades: boolean
  friendsOnly: boolean
  onFriendsOnly: (on: boolean) => void
  friends: FriendHaves
  /** Percent cheaper than when added to a wishlist, by card key. */
  drops: Map<string, number>
  pool: CopyPool
  meta: Map<string, ListMeta>
  infoOf: (card: WantedCard) => CardInfo | null | undefined
  onBought: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
  onOpenTrade: (friend: string) => void
  onNew: (kind: ListKind) => void
}

/** Cards tab: the cards lists still miss, with price drops, friends who have them, and Bought. */
export function CardsTab(props: CardsTabProps) {
  const { overview, visible, separate, noLists, filters, friends, drops, pool, meta } = props
  if (noLists) {
    return (
      <div className="empty">
        <p>{separate ? 'No decks or wishlists yet.' : 'No wishlists yet.'}</p>
        <p className="muted">Most Wanted gathers the cards your {separate ? 'decks and wishlists' : 'wishlists'} still miss.</p>
        <div className="welcome-actions">
          {separate && (
            <button type="button" onClick={() => props.onNew('deck')}>
              New deck
            </button>
          )}
          <button type="button" onClick={() => props.onNew('wishlist')}>
            New wishlist
          </button>
        </div>
      </div>
    )
  }
  if (overview.cards.length === 0) {
    return (
      <div className="empty">
        <p>Nothing to buy.</p>
        <p className="muted">Every {separate ? 'deck and wishlist' : 'wishlist'} card is in your inventory, basic lands aside.</p>
      </div>
    )
  }
  return (
    <>
      <FilterBar
        filters={filters}
        onChange={props.onFilters}
        namePlaceholder="Filter by name…"
        loadingNote={needsCardData(filters) && overview.cards.some((card) => props.infoOf(card) === undefined) ? 'Loading card data…' : undefined}
        end={<SortSelect value={props.sort} options={WANTED_SORTS} onChange={props.onSort} />}
      >
        {props.hasTrades && (
          <label className="check" title="Cards on a friend's trade list: ask before buying">
            <input type="checkbox" checked={props.friendsOnly} onChange={(event) => props.onFriendsOnly(event.target.checked)} />
            A friend has it
          </label>
        )}
        {(filtersActive(filters) || props.friendsOnly) && (
          <span className="muted small">
            Showing {visible.length} of {overview.cards.length}
          </span>
        )}
      </FilterBar>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Wanted in</th>
            <th
              className="col-num"
              title={
                separate
                  ? 'Copies to buy so every list is covered: each list needs its own (Settings)'
                  : 'Copies to buy so every list is covered: one copy counts for all lists (Settings)'
              }
            >
              To buy
            </th>
            <th className="col-num">Cost</th>
            <th className="col-actions" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {visible.map((card) => {
            const unit = overview.unitOf(card)
            const printing = overview.printingOf(card)
            const drop = drops.get(card.key)
            const haves = friends.get(card.key)
            const usedBy = card.owned > 0 ? pool.usedBy(card.key, card.owned) : []
            return (
              <tr key={card.key}>
                <NameCell images={printing} name={card.name} loading={unit === undefined}>
                  <span className="card-name" title={card.name}>
                    {card.name}
                  </span>
                  {card.completes.length > 0 && (
                    <span className="chip completes-chip" title="The last card these lists miss (basic lands aside)">
                      ✓ Completes {card.completes.map((list) => list.name).join(', ')}
                    </span>
                  )}
                  {drop !== undefined && (
                    <span className="chip cheaper" title="Cheaper than when it was added to a wishlist">
                      ↓ {drop}% cheaper
                    </span>
                  )}
                  {haves && (
                    <button
                      type="button"
                      className="chip link friend-chip"
                      onClick={() => props.onOpenTrade(haves[0].friend)}
                      title={haves.map((have) => `${have.friend} has ${have.qty}`).join('\n')}
                    >
                      {haves.length === 1 ? `${haves[0].friend} has it` : `${haves.length} friends have it`}
                    </button>
                  )}
                  {card.owned > 0 && (
                    <span className="muted small owned-note">
                      {card.owned} owned{separate && usedBy.length > 0 && ` · ${heldWhere(usedBy, card.owned)}`}
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
      {visible.length === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
    </>
  )
}
