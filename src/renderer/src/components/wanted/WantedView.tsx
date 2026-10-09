import { useState } from 'react'
import type { AppSettings, PriceBaseline } from '@shared/api'
import { matchesFilters, NO_FILTERS, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { countLines, nameKey } from '@shared/decklist'
import { sumOf } from '@shared/totals'
import type { TradeSnapshot } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { DEFAULT_WANTED_SORT, isWantedSort, sortWanted, type WantedCard, type WantedSort } from '@shared/wanted'
import { useCopyPool } from '../../hooks/useCopyPool'
import { useStoredValue } from '../../hooks/useStoredValue'
import { cardCount, formatEur } from '../../lib/format'
import { listRows } from '../../lib/summary'
import { wantedOverview } from '../../lib/wanted'
import { getCardInfo, useCardInfoVersion } from '../../stores/cardinfo'
import { priceDrop, useBaselines } from '../../stores/history'
import type { CardList, LibraryActions, ListRef } from '../../stores/library'
import { usePrintingsVersion } from '../../stores/printings'
import { useSettings } from '../../stores/settings'
import { Segmented } from '../Controls'
import { Icon } from '../Icon'
import { useToast } from '../Toasts'
import { BasicsTab } from './BasicsTab'
import { BudgetPlanner } from './BudgetPlanner'
import { CardsTab, type FriendHaves } from './CardsTab'
import { listMetas } from './parts'
import { TokensTab } from './TokensTab'

/** Page tab. */
type WantedTab = 'cards' | 'basics' | 'tokens'

/** Type guard for {@link WantedTab}. */
const isTab = (value: string): value is WantedTab => value === 'cards' || value === 'basics' || value === 'tokens'

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

/** Biggest price drop per wanted card, in percent, by name key. */
function priceDrops(
  wishlists: CardList[],
  inventory: Map<string, InventoryItem>,
  settings: AppSettings,
  pool: CopyPool,
  baselines: Record<string, PriceBaseline>
): Map<string, number> {
  const drops = new Map<string, number>()
  for (const list of wishlists) {
    for (const row of listRows(list, inventory, settings, pool)) {
      if (row.bundledIds) continue
      const drop = priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)
      if (drop) drops.set(nameKey(row.line.name), Math.max(drops.get(nameKey(row.line.name)) ?? 0, drop.percent))
    }
  }
  return drops
}

/** Friends who have each card on their trade lists, by name key. */
function friendHaves(trades: TradeSnapshot[]): FriendHaves {
  const friends: FriendHaves = new Map()
  for (const trade of trades) {
    for (const have of trade.haves) {
      const key = nameKey(have.name)
      friends.set(key, [...(friends.get(key) ?? []), { friend: trade.name, qty: have.qty }])
    }
  }
  return friends
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
  const meta = listMetas(lists)
  const infoOf = (card: WantedCard) => getCardInfo(card.name, settings.bundleBasics)
  const withDecks = [...overview.cards, ...overview.basics].some((card) => card.lists.some((list) => list.kind === 'deck'))
  const friends = friendHaves(trades)

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
  const copy = (text: string, what: string) => window.api.copyText(text).then(() => toast(`${what} copied to clipboard`))
  const copyTab = () => {
    const cards = tab === 'cards' ? visible : basics
    void copy(countLines(cards.map((card) => ({ qty: card.toBuy, name: card.name }))).join('\n'), tab === 'cards' ? 'Cards to buy' : 'Basic lands')
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

      {tabs.length > 1 && <Segmented label="Most Wanted" tabs className="wanted-tabs" options={tabs} value={tab} onChange={setTab} />}

      {tab === 'cards' && (
        <CardsTab
          overview={overview}
          visible={visible}
          separate={separate}
          noLists={noLists}
          filters={filters}
          onFilters={setFilters}
          sort={sort}
          onSort={setSort}
          hasTrades={trades.length > 0}
          friendsOnly={friendsOnly}
          onFriendsOnly={setFriendsOnly}
          friends={friends}
          drops={priceDrops(wishlists, inventory, settings, pool, baselines)}
          pool={pool}
          meta={meta}
          infoOf={infoOf}
          onBought={markBought}
          onOpenList={onOpenList}
          onOpenTrade={onOpenTrade}
          onNew={onNew}
        />
      )}
      {tab === 'basics' && (
        <BasicsTab
          overview={overview}
          basics={basics}
          separate={separate}
          bundleBasics={settings.bundleBasics}
          meta={meta}
          onBought={markBought}
          onOpenList={onOpenList}
        />
      )}
      {tab === 'tokens' && <TokensTab wishlists={wishlists} meta={meta} onOpenList={onOpenList} onCopy={copy} />}
    </div>
  )
}
