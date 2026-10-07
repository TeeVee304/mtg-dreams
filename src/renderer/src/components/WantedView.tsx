import { useState, type ReactNode } from 'react'
import { filtersActive, matchesFilters, needsCardData, NO_FILTERS, type CardFilters } from '@shared/cards'
import { bundledBasic } from '@shared/basics'
import { listId, type ListKey } from '@shared/copies'
import { cardLines, countLines, nameKey } from '@shared/decklist'
import { listColor } from '@shared/listColor'
import { heldWhere } from '@shared/listModel'
import { listPriority, priorityWeight, type ListPriority } from '@shared/listPriority'
import type { ThemeColor } from '@shared/themes'
import { sumOf } from '@shared/totals'
import { featuredTokens, tokenLabel } from '@shared/tokens'
import type { TradeSnapshot } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import {
  DEFAULT_WANTED_SORT,
  isWantedSort,
  planPurchases,
  sortWanted,
  WANTED_SORTS,
  type WantedCard,
  type WantedSort
} from '@shared/wanted'
import { useCopyPool } from '../hooks/useCopyPool'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { useStoredValue } from '../hooks/useStoredValue'
import { cardCount, formatEur } from '../lib/format'
import { listRows } from '../lib/summary'
import { wantedOverview, type WantedOverview } from '../lib/wanted'
import { getCardInfo, useCardInfoVersion } from '../stores/cardinfo'
import { priceDrop, useBaselines } from '../stores/history'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { useDeckTokens } from '../stores/tokens'
import { CardmarketButton, ListChip, NameCell, Price } from './CardCells'
import { Collapsible } from './Collapsible'
import { Segmented, SortSelect } from './Controls'
import { FilterBar } from './FilterBar'
import { Icon } from './Icon'
import { Skeleton } from './Placeholders'
import { useToast } from './Toasts'

/** Page tab. */
type WantedTab = 'cards' | 'basics' | 'tokens'

/** Type guard for {@link WantedTab}. */
const isTab = (value: string): value is WantedTab => value === 'cards' || value === 'basics' || value === 'tokens'

/** Valid stored budget: a positive number. */
const isBudget = (value: string): value is string => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0

/** List display data. */
interface ListMeta {
  color: ThemeColor | null
  /** Wishlists only. */
  priority: ListPriority | null
}

/** List chip input: a list wanting a card. */
interface ChipList extends ListKey {
  /** Copies the list wants. */
  wants?: number
  /** Copies the list lacks. */
  missing?: number
}

/** Props of {@link WantedView}. */
interface WantedViewProps {
  /** All lists; decks count with separate copies only. */
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  /** Friends' trade lists, for "a friend has it" hints. */
  trades: TradeSnapshot[]
  actions: LibraryActions
  onOpenList: (list: ListRef) => void
  onOpenTrade: (friend: string) => void
  /** Opens the new deck or wishlist dialog. */
  onNew: (kind: ListKind) => void
}

/**
 * Most Wanted page: cards still missing from wishlists (and decks, with separate copies), merged
 * across lists and ranked for buying (best value by default), with a budget planner. Basic lands
 * and the tokens wishlist cards create have their own tabs, shown when they have something to show.
 */
export function WantedView({ lists, inventory, trades, actions, onOpenList, onOpenTrade, onNew }: WantedViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  useCardInfoVersion()
  const settings = useSettings()
  const baselines = useBaselines()
  const [storedTab, setTab] = useStoredValue<WantedTab>('mtg-dreams.wantedTab', 'cards', isTab)
  const [sort, setSort] = useStoredValue<WantedSort>('mtg-dreams.wantedSort', DEFAULT_WANTED_SORT, isWantedSort)
  const [filters, setFilters] = useState<CardFilters>(NO_FILTERS)
  const [friendsOnly, setFriendsOnly] = useState(false)

  const pool = useCopyPool(lists)
  const wishlists = lists.filter((list) => list.kind === 'wishlist')
  const overview = wantedOverview(lists, inventory, settings, pool)
  const separate = overview.mode === 'separate'
  const meta = new Map<string, ListMeta>(
    lists.map((list) => [listId(list), { color: listColor(list.lines), priority: list.kind === 'wishlist' ? listPriority(list.lines) : null }])
  )
  const infoOf = (card: WantedCard) => getCardInfo(card.name, settings.bundleBasics)
  const withDecks = [...overview.cards, ...overview.basics].some((card) => card.lists.some((list) => list.kind === 'deck'))

  const drops = new Map<string, number>()
  for (const list of wishlists) {
    for (const row of listRows(list, inventory, settings, pool)) {
      if (row.bundledIds) continue
      const drop = priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)
      if (drop) drops.set(nameKey(row.line.name), Math.max(drops.get(nameKey(row.line.name)) ?? 0, drop.percent))
    }
  }

  const friends = new Map<string, Array<{ friend: string; qty: number }>>()
  for (const trade of trades) {
    for (const have of trade.haves) {
      const key = nameKey(have.name)
      friends.set(key, [...(friends.get(key) ?? []), { friend: trade.name, qty: have.qty }])
    }
  }

  const visible = sortWanted(
    overview.cards.filter((card) => matchesFilters(card.name, infoOf(card), undefined, filters) && (!friendsOnly || friends.has(card.key))),
    sort,
    overview.unitOf,
    infoOf
  )
  const basics = [...overview.basics].sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name))
  /** Lists Most Wanted draws from: decks count with separate copies only. */
  const noLists = (separate ? lists : wishlists).length === 0
  const toBuy = (cards: WantedCard[]) => sumOf(cards, (card) => card.toBuy)
  const tabs = (
    [
      { id: 'cards', label: `Cards · ${toBuy(overview.cards)}` },
      { id: 'basics', label: `Basic lands · ${toBuy(overview.basics)}` },
      { id: 'tokens', label: 'Tokens' }
    ] as const
  ).filter(({ id }) => id === 'cards' || (id === 'basics' ? basics.length > 0 : wishlists.length > 0))
  const tab = tabs.some(({ id }) => id === storedTab) ? storedTab : 'cards'
  const copyable = tab === 'cards' ? visible.length > 0 : tab === 'basics'
  const completers = overview.cards.filter((card) => card.completes.length > 0).length

  const markBought = (card: WantedCard) => {
    actions.setOwned(card.name, card.owned + card.toBuy)
    toast(`Marked ${card.toBuy}× ${card.name} as bought (Ctrl+Z to undo)`)
  }

  const listChips = (card: { lists: ChipList[] }) =>
    card.lists.map((list) => {
      const info = meta.get(listId(list))
      const wants = list.wants === undefined ? '' : ` wants ${list.wants}${list.missing !== undefined && list.missing < list.wants ? `, misses ${list.missing}` : ''}`
      const kind = list.kind === 'deck' ? 'Deck ' : ''
      const priority = info?.priority && info.priority !== 'normal' ? ` · ${info.priority} priority` : ''
      return (
        <ListChip
          key={listId(list)}
          color={info?.color ?? null}
          className={info?.priority === 'low' ? 'low' : undefined}
          onClick={() => onOpenList(list)}
          title={`${kind}${list.name}${wants}${priority}`}
        >
          {info?.priority === 'high' && '★ '}
          {list.kind === 'deck' && <Icon name="deck" />}
          {list.name}
          {list.missing !== undefined && list.missing > 1 && ` · ${list.missing}`}
        </ListChip>
      )
    })

  const copy = (text: string, what: string) => window.api.copyText(text).then(() => toast(`${what} copied to clipboard`))
  const copyTab = () => {
    if (tab === 'cards') void copy(countLines(visible.map((card) => ({ qty: card.toBuy, name: card.name }))).join('\n'), 'Cards to buy')
    else if (tab === 'basics') void copy(countLines(basics.map((card) => ({ qty: card.toBuy, name: card.name }))).join('\n'), 'Basic lands')
  }

  return (
    <div className="view wanted-view">
      <header className="view-header">
        <div>
          <h1 className="nav-icon-name">
            Most Wanted <Icon name="cart" />
          </h1>
          {!noLists && (
            <p className="muted">
              {cardCount(toBuy(overview.cards))} to buy · {formatEur(overview.total)} to complete every {withDecks ? 'deck and wishlist' : 'wishlist'}
              {overview.loading > 0 && ` (${overview.loading} still loading)`}
              {completers > 0 && ` · ${completers} complete a list`}
            </p>
          )}
        </div>
        <div className="header-actions">
          {copyable && (
            <button type="button" onClick={copyTab} title="As “N Card Name” lines, e.g. for a Cardmarket wants list">
              Copy as text
            </button>
          )}
        </div>
      </header>

      {overview.cards.length > 0 && <BudgetPlanner overview={overview} actions={actions} onCopy={copy} />}

      {tabs.length > 1 && (
        <Segmented label="Most Wanted" tabs className="wanted-tabs" options={tabs} value={tab} onChange={setTab} />
      )}

      {tab === 'cards' && noLists && (
        <div className="empty">
          <p>{separate ? 'No decks or wishlists yet.' : 'No wishlists yet.'}</p>
          <p className="muted">Most Wanted gathers the cards your {separate ? 'decks and wishlists' : 'wishlists'} still miss.</p>
          <div className="welcome-actions">
            {separate && (
              <button type="button" onClick={() => onNew('deck')}>
                New deck
              </button>
            )}
            <button type="button" onClick={() => onNew('wishlist')}>
              New wishlist
            </button>
          </div>
        </div>
      )}

      {tab === 'cards' &&
        !noLists &&
        (overview.cards.length === 0 ? (
          <div className="empty">
            <p>Nothing to buy.</p>
            <p className="muted">Every {separate ? 'deck and wishlist' : 'wishlist'} card is in your inventory, basic lands aside.</p>
          </div>
        ) : (
          <>
            <FilterBar
              filters={filters}
              onChange={setFilters}
              namePlaceholder="Filter by name…"
              loadingNote={needsCardData(filters) && overview.cards.some((card) => infoOf(card) === undefined) ? 'Loading card data…' : undefined}
              end={<SortSelect value={sort} options={WANTED_SORTS} onChange={setSort} />}
            >
              {trades.length > 0 && (
                <label className="check" title="Cards on a friend's trade list: ask before buying">
                  <input type="checkbox" checked={friendsOnly} onChange={(event) => setFriendsOnly(event.target.checked)} />
                  A friend has it
                </label>
              )}
              {(filtersActive(filters) || friendsOnly) && (
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
                            onClick={() => onOpenTrade(haves[0].friend)}
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
                        <div className="chips">{listChips(card)}</div>
                      </td>
                      <td className="col-num">{card.toBuy}</td>
                      <td className="col-num">
                        <Price unit={unit} qty={card.toBuy} />
                      </td>
                      <td className="col-actions">
                        {printing?.cardmarketUrl && <CardmarketButton url={printing.cardmarketUrl} />}
                        <BoughtButton card={card} onBought={markBought} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="muted empty-filter">No cards match the current filters.</p>}
          </>
        ))}

      {tab === 'basics' &&
        (basics.length === 0 ? (
          <div className="empty">
            <p>No basic lands needed.</p>
          </div>
        ) : (
          <>
            <p className="muted small wanted-note">
              Basic lands your {separate ? 'lists' : 'wishlists'} still need. They're left out of Cards and of list completion
              {settings.bundleBasics ? '; bundled basic lands count as free (Settings).' : '.'}
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
                {basics.map((card) => {
                  const printing = overview.printingOf(card)
                  return (
                    <tr key={card.key}>
                      <NameCell images={printing} name={card.name}>
                        <span className="card-name">{card.name}</span>
                      </NameCell>
                      <td>
                        <div className="chips">{listChips(card)}</div>
                      </td>
                      <td className="col-num">{card.toBuy}</td>
                      <td className="col-num">
                        <Price unit={overview.unitOf(card)} qty={card.toBuy} free={!!bundledBasic(card.name, settings.bundleBasics)} />
                      </td>
                      <td className="col-actions">
                        <BoughtButton card={card} onBought={markBought} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        ))}

      {tab === 'tokens' && <TokensTab wishlists={wishlists} meta={meta} listChips={listChips} onCopy={copy} />}
    </div>
  )
}

/** Marks a card's copies to buy as bought. */
function BoughtButton({ card, onBought }: { card: WantedCard; onBought: (card: WantedCard) => void }) {
  return (
    <button type="button" className="bought-btn" onClick={() => onBought(card)} title={`Add ${card.toBuy} to your inventory`} aria-label="Bought">
      <Icon name="check" /> <span className="bought-label">Bought</span>
    </button>
  )
}

/**
 * Collapsible budget planner, closed by default: picks the cards with the most benefit per euro
 * within a budget ({@link planPurchases}).
 */
function BudgetPlanner({
  overview,
  actions,
  onCopy
}: {
  overview: WantedOverview
  actions: LibraryActions
  onCopy: (text: string, what: string) => void
}) {
  const toast = useToast()
  const [open, toggle] = useStoredToggle('mtg-dreams.plannerOpen', false)
  const [budgetText, setBudgetText] = useStoredValue<string>('mtg-dreams.budget', '50', isBudget)
  const [draft, setDraft] = useState(budgetText)
  const budget = Number(budgetText)
  const ordered = sortWanted(overview.cards, 'value', overview.unitOf, () => null)
  const plan = open ? planPurchases(ordered, overview.unitOf, budget, overview) : null
  const needs = plan ? sumOf(plan.items, (item) => item.lists.length) : 0
  const copies = plan ? sumOf(plan.items, (item) => item.copies) : 0

  return (
    <Collapsible open={open} onToggle={toggle} title="Budget planner" summary="The most list progress for your money">
      {plan && (
        <div className="planner-body">
          <div className="planner-head">
            <label className="field-inline">
              Budget
              <input
                type="number"
                min={1}
                step={5}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (isBudget(event.target.value)) setBudgetText(event.target.value)
                }}
                aria-label="Budget in euros"
              />
              €
            </label>
            <span>
              <strong>{cardCount(copies)}</strong> for <strong>{formatEur(plan.total)}</strong> · covers {needs} list{' '}
              {needs === 1 ? 'need' : 'needs'}
              {plan.completes.length > 0 && (
                <span title="Every card these lists miss, basic lands aside"> · completes {plan.completes.map((list) => list.name).join(', ')}</span>
              )}
            </span>
            <span className="spacer" />
            <button
              type="button"
              disabled={plan.items.length === 0}
              onClick={() => onCopy(countLines(plan.items.map((item) => ({ qty: item.copies, name: item.card.name }))).join('\n'), 'Shopping list')}
            >
              Copy as text
            </button>
            <button
              type="button"
              disabled={plan.items.length === 0}
              onClick={() => {
                actions.addOwned(plan.items.map((item) => ({ name: item.card.name, qty: item.copies })))
                toast(`Marked ${cardCount(copies)} as bought (Ctrl+Z to undo)`)
              }}
            >
              <Icon name="check" /> Mark all as bought
            </button>
          </div>
          {plan.items.length > 0 ? (
            <ol className="plan-list">
              {plan.items.map((item) => (
                <li key={item.card.key}>
                  <span className="plan-name">
                    {item.copies}× {item.card.name}
                  </span>
                  <span className="muted small">{item.lists.map((list) => list.name).join(', ')}</span>
                  <span className="plan-cost">{formatEur(item.cost)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">Nothing fits this budget.</p>
          )}
          {plan.unpriced > 0 && (
            <p className="muted small">
              {cardCount(plan.unpriced)} without a price {overview.loading > 0 ? '(or still loading) ' : ''}are left out.
            </p>
          )}
        </div>
      )}
    </Collapsible>
  )
}

/** Tokens tab: tokens, emblems and helpers wishlist cards create, by the lists that want them. */
function TokensTab({
  wishlists,
  meta,
  listChips,
  onCopy
}: {
  wishlists: CardList[]
  meta: Map<string, ListMeta>
  listChips: (card: { lists: ChipList[] }) => ReactNode
  onCopy: (text: string, what: string) => void
}) {
  const perList = wishlists.map((list) => ({ name: list.name, keys: new Set(cardLines(list.lines).map((line) => nameKey(line.name))) }))
  const names = [...new Set(wishlists.flatMap((list) => cardLines(list.lines).map((line) => line.name)))]
  const data = useDeckTokens(names)
  if (!data) return <Skeleton width={200} />
  const weightOf = (name: string) => priorityWeight(meta.get(listId({ kind: 'wishlist', name }))?.priority ?? 'normal')
  const tokens = featuredTokens(data, names)
    .map((entry) => {
      const lists = perList.filter((list) => entry.makers.some((maker) => list.keys.has(nameKey(maker)))).map((list) => ({ kind: 'wishlist' as const, name: list.name }))
      return { entry, lists, weight: sumOf(lists, (list) => weightOf(list.name)) }
    })
    .sort((a, b) => b.weight - a.weight || a.entry.token.name.localeCompare(b.entry.token.name))
  if (tokens.length === 0) {
    return (
      <div className="empty">
        <p>{data.available ? 'No wishlist card creates tokens, emblems or helpers.' : 'Token data unavailable (Scryfall).'}</p>
      </div>
    )
  }
  return (
    <>
      <div className="wanted-note-row">
        <p className="muted small wanted-note">Tokens, emblems and helpers your wishlist cards create, owned or not.</p>
        <button type="button" onClick={() => onCopy(tokens.map(({ entry }) => tokenLabel(entry)).join('\n'), 'Tokens')}>
          Copy as text
        </button>
      </div>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Made by</th>
            <th>Wanted in</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map(({ entry, lists }) => (
            <tr key={entry.key}>
              <NameCell images={entry.token}>
                <span className="card-name">{tokenLabel(entry)}</span>
              </NameCell>
              <td className="muted small">{entry.makers.join(', ')}</td>
              <td>
                <div className="chips">{listChips({ lists })}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
