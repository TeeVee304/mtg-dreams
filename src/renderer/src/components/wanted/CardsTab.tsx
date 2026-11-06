import { Fragment } from 'react'
import { filtersActive, needsCardData, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { heldWhere } from '@shared/listModel'
import { fullyOrdered, orderedCopies, type OrderStamps } from '@shared/ordered'
import type { CardInfo, ListKind } from '@shared/types'
import { WANTED_SORTS, type WantedCard, type WantedSort } from '@shared/wanted'
import { ui } from '@shared/text'
import type { WantedOverview } from '../../lib/wanted'
import type { PriceChange } from '../../stores/history'
import type { ListRef } from '../../stores/library'
import { formatIsoDate } from '../../lib/format'
import { CardmarketButton, NameCell, Price } from '../CardCells'
import { SortSelect } from '../Controls'
import { FilterBar } from '../FilterBar'
import { Icon } from '../Icon'
import { AcquiredStampMark, BoughtButton, ListChips, OrderStampMark, StampButton, orderedAgo, type ListMeta, type StampMotion } from './parts'

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
  /** Ordered stamps, by card key. */
  stamps: OrderStamps
  /** Today, `YYYY-MM-DD`. */
  today: string
  /** Cards just stamped: their stamp lands, and they stay in place until it has. */
  /** Stamps in motion. */
  motion: StampMotion
  onStamp: (card: WantedCard) => void
  onOpenList: (list: ListRef) => void
  onOpenTrade: (friend: string) => void
  onNew: (kind: ListKind) => void
}

/**
 * Cards tab: the cards lists still miss, with price changes, friends who have them, Ordered and
 * Bought. Cards whose copies are all ordered move to an Ordered group at the end, once their stamp
 * has landed.
 */
export function CardsTab(props: CardsTabProps) {
  const { overview, visible, noLists, filters, friends, changes, pool, meta, stamps, today, motion } = props
  const settled = (card: WantedCard) => fullyOrdered(card, stamps) && !motion.landing.has(card.key)
  const open = visible.filter((card) => !settled(card))
  const done = visible.filter(settled)
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
          {[...open, ...done].map((card, i) => {
            const unit = overview.unitOf(card)
            const stamp = stamps[card.key]
            const ordered = orderedCopies(card, stamps)
            const full = ordered > 0 && ordered >= card.toBuy
            const left = card.toBuy - ordered
            const acquired = motion.acquiring.has(card.key)
            const undoing = motion.unacquiring.has(card.key)
            const lifting = motion.lifting.has(card.key)
            const printing = overview.printingOf(card)
            const change = changes.get(card.key)
            const haves = friends.get(card.key)
            const usedBy = card.owned > 0 ? pool.usedBy(card.key, card.owned) : []
            return (
              <Fragment key={card.key}>
              {i === open.length && (
                <tr className="ordered-divider">
                  <td colSpan={5} title={ui.wanted.orderedGroupHint}>
                    <Icon name="stamp" /> {ui.wanted.orderedGroup}
                  </td>
                </tr>
              )}
              <tr className={acquired && !undoing ? 'is-acquired' : full ? 'is-ordered' : undefined}>
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
                  {stamp && ordered > 0 && !full && (
                    <span className="chip partly-ordered" title={ui.wanted.partlyOrderedHint(orderedAgo(stamp, today), left)}>
                      <Icon name="stamp" /> {ui.wanted.partlyOrdered(ordered, card.toBuy, formatIsoDate(stamp.date))}
                    </span>
                  )}
                </NameCell>
                <td className="stamp-cell">
                  <ListChips lists={card.lists} meta={meta} onOpenList={props.onOpenList} />
                  {stamp && full && (
                    <OrderStampMark stamp={stamp} qty={ordered} today={today} fresh={motion.landing.has(card.key)} lifting={lifting} dim={acquired && !undoing} />
                  )}
                  {acquired && <AcquiredStampMark qty={card.toBuy} today={today} lifting={undoing} />}
                </td>
                <td className="col-num">{full ? card.toBuy : left}</td>
                <td className="col-num">
                  <Price unit={unit} qty={full ? card.toBuy : left} />
                </td>
                <td className="col-actions">
                  {printing?.cardmarketUrl && <CardmarketButton url={printing.cardmarketUrl} />}
                  <StampButton card={card} stamped={full} onStamp={props.onStamp} disabled={acquired || lifting} />
                  <BoughtButton card={card} onBought={props.onBought} pressed={acquired && !undoing} disabled={undoing || lifting} />
                </td>
              </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {visible.length === 0 && <p className="muted empty-filter">{ui.wanted.noMatch}</p>}
    </>
  )
}
