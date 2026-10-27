import { useState } from 'react'
import type { AppSettings, PriceBaseline } from '@shared/api'
import { matchesFilters, NO_FILTERS, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { countLines, nameKey } from '@shared/decklist'
import { sumOf } from '@shared/totals'
import type { TradeSnapshot } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { DEFAULT_WANTED_SORT, isWantedSort, sortWanted, type WantedCard, type WantedSort } from '@shared/wanted'
import { ui } from '@shared/text'
import { useCopyPool } from '../../hooks/useCopyPool'
import { useStoredValue } from '../../hooks/useStoredValue'
import { formatEur } from '../../lib/format'
import { listRows } from '../../lib/summary'
import { wantedOverview } from '../../lib/wanted'
import { getCardInfo, useCardInfoVersion } from '../../stores/cardinfo'
import { priceChange, useBaselines } from '../../stores/history'
import type { CardList, LibraryActions, ListRef } from '../../stores/library'
import { usePrintingsVersion } from '../../stores/printings'
import { useSettings } from '../../stores/settings'
import { preferredGroup } from '../../stores/setGroups'
import { Segmented } from '../Controls'
import { useToast } from '../Toasts'
import { BasicsTab } from './BasicsTab'
import { BudgetPlanner } from './BudgetPlanner'
import { WishlistShelf } from './WishlistShelf'
import { CardsTab, type CardPriceChange, type FriendHaves } from './CardsTab'
import { listMetas } from './parts'
import { TokensTab } from './TokensTab'
import { useCopy } from '../../hooks/useCopy'

/** Page tab. */
type WantedTab = 'cards' | 'basics' | 'tokens'

/** Type guard for {@link WantedTab}. */
const isTab = (value: string): value is WantedTab => value === 'cards' || value === 'basics' || value === 'tokens'

/** Props of {@link WantedView}. */
interface WantedViewProps {
  /** All decks and wishlists. */
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
 * Price change per wanted card since it was added to a wishlist, by name key. A card on several
 * wishlists shows its biggest drop if any line got cheaper, else its biggest rise.
 */
function priceChanges(
  wishlists: CardList[],
  inventory: Map<string, InventoryItem>,
  settings: AppSettings,
  pool: CopyPool,
  baselines: Record<string, PriceBaseline>
): Map<string, CardPriceChange> {
  const changes = new Map<string, CardPriceChange>()
  for (const list of wishlists) {
    const group = preferredGroup(list)?.name
    for (const row of listRows(list, inventory, settings, pool)) {
      if (row.bundledIds) continue
      const change = priceChange(row.line, row.unit, row.owned, settings, baselines, group, settings)
      if (!change) continue
      const key = nameKey(row.line.name)
      const known = changes.get(key)
      const better =
        !known ||
        (change.direction === 'down' && known.direction === 'up') ||
        (change.direction === known.direction && change.percent > known.percent)
      if (better) changes.set(key, { direction: change.direction, percent: change.percent })
    }
  }
  return changes
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
 * Most Wanted page: cards still missing from decks and wishlists, merged
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

  const pool = useCopyPool(lists)
  const wishlists = lists.filter((list) => list.kind === 'wishlist')
  const overview = wantedOverview(lists, inventory, settings, pool)
  const meta = listMetas(lists)
  const infoOf = (card: WantedCard) => getCardInfo(card.name, settings.bundleBasics)
  const withDecks = [...overview.cards, ...overview.basics].some((card) => card.lists.some((list) => list.kind === 'deck'))
  const friends = friendHaves(trades)

  const visible = sortWanted(
    overview.cards.filter((card) => matchesFilters(card.name, infoOf(card), undefined, filters)),
    sort,
    overview.unitOf,
    infoOf
  )
  const basics = [...overview.basics].sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name))
  const noLists = lists.length === 0
  const toBuy = (cards: WantedCard[]) => sumOf(cards, (card) => card.toBuy)
  const tabs = (
    [
      { id: 'cards', label: ui.wanted.tabs.cards(toBuy(overview.cards)) },
      { id: 'basics', label: ui.wanted.tabs.basics },
      { id: 'tokens', label: ui.wanted.tokens }
    ] as const
  ).filter(({ id }) => id === 'cards' || (id === 'basics' ? basics.length > 0 : wishlists.length > 0))
  const tab = tabs.some(({ id }) => id === storedTab) ? storedTab : 'cards'
  const copyable = tab === 'cards' ? visible.length > 0 : tab === 'basics'
  const completers = overview.cards.filter((card) => card.completes.length > 0).length

  const markBought = (card: WantedCard) => {
    actions.setOwned(card.name, card.owned + card.toBuy)
    toast(ui.wanted.markedBought(card.toBuy, card.name))
  }
  const copyText = useCopy()
  const copy = (text: string, what: string) => copyText(text, ui.wanted.copied(what))
  const copyTab = () => {
    const cards = tab === 'cards' ? visible : basics
    void copy(countLines(cards.map((card) => ({ qty: card.toBuy, name: card.name }))).join('\n'), tab === 'cards' ? ui.wanted.cardsToBuy : ui.wanted.basicLands)
  }

  return (
    <div className="view wanted-view">
      <header className="view-header">
        <div>
          <h1>{ui.wanted.title}</h1>
          {!noLists && (
            <p className="muted">
              {ui.wanted.summary(toBuy(overview.cards), formatEur(overview.total), withDecks)}
              {overview.loading > 0 && ui.wanted.stillLoading(overview.loading)}
              {completers > 0 && ui.wanted.completers(completers)}
            </p>
          )}
        </div>
        <div className="header-actions">
          {copyable && (
            <button type="button" onClick={copyTab} title={ui.wanted.copyHint}>
              {ui.wanted.copyAsText}
            </button>
          )}
        </div>
      </header>

      <WishlistShelf lists={lists} inventory={inventory} onOpenList={onOpenList} />

      {overview.cards.length > 0 && <BudgetPlanner overview={overview} actions={actions} onCopy={copy} />}

      {tabs.length > 1 && <Segmented label={ui.wanted.title} tabs className="wanted-tabs" options={tabs} value={tab} onChange={setTab} />}

      {tab === 'cards' && (
        <CardsTab
          overview={overview}
          visible={visible}
          noLists={noLists}
          filters={filters}
          onFilters={setFilters}
          sort={sort}
          onSort={setSort}
          friends={friends}
          changes={priceChanges(wishlists, inventory, settings, pool, baselines)}
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
