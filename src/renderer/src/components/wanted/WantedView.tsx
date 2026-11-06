import { useEffect, useRef, useState } from 'react'
import type { AppSettings, PriceBaseline } from '@shared/api'
import { matchesFilters, NO_FILTERS, type CardFilters } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { countLines, nameKey } from '@shared/decklist'
import { dayOf, fullyOrdered, orderedCopies, prunedStamps, withStamp, type OrderStamps } from '@shared/ordered'
import type { TradeSnapshot } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { DEFAULT_WANTED_SORT, isWantedSort, sortWanted, type WantedCard, type WantedSort } from '@shared/wanted'
import { ui } from '@shared/text'
import { useCopyPool } from '../../hooks/useCopyPool'
import { useStoredValue } from '../../hooks/useStoredValue'
import { formatEur } from '../../lib/format'
import { listRows } from '../../lib/summary'
import { unordered, wantedOverview } from '../../lib/wanted'
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
import { listMetas, type StampMotion } from './parts'
import { TokensTab } from './TokensTab'
import { Icon } from '../Icon'
import { useCopy } from '../../hooks/useCopy'

/** How long a fresh stamp takes to land before its row joins the Ordered group, in ms. */
const LANDING_MS = 1300

/** How long the Acquired stamp shows before the card goes to the Inventory, in ms; a click within it undoes. */
const ACQUIRE_MS = 2000

/** How long a stamp takes to lift off: its landing, played backwards, in ms. Matches wanted.css. */
const LIFT_MS = 560

/** @returns `keys` with `key`. */
const withKey = (keys: ReadonlySet<string>, key: string): ReadonlySet<string> => new Set([...keys, key])

/** @returns `keys` without `key`. */
const withoutKey = (keys: ReadonlySet<string>, key: string): ReadonlySet<string> => new Set([...keys].filter((k) => k !== key))

/** Page tab. */
type WantedTab = 'cards' | 'basics' | 'tokens'

/** Type guard for {@link WantedTab}. */
const isTab = (value: string): value is WantedTab => value === 'cards' || value === 'basics' || value === 'tokens'

/** Props of {@link WantedView}. */
interface WantedViewProps {
  /** All decks and wishlists. */
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  /** Cards stamped as ordered. */
  ordered: OrderStamps
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
export function WantedView({ lists, inventory, ordered, trades, actions, onOpenList, onOpenTrade, onNew }: WantedViewProps) {
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
  const left = unordered(overview, ordered)
  const today = dayOf(new Date())
  /** Cards just stamped, while their stamp lands. */
  const [landing, setLanding] = useState<ReadonlySet<string>>(new Set())
  const landed = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(landed.current), [])

  // Stamps of cards no longer wanted (bought, or dropped from every list) go when the page opens.
  // Only then: pruning while it is open would drop a stamp before Bought is undone.
  useEffect(() => {
    const keys = [...overview.cards, ...overview.basics].map((card) => card.key)
    const pruned = prunedStamps(ordered, keys)
    if (Object.keys(pruned).length < Object.keys(ordered).length) actions.setOrdered(pruned)
  }, [])

  const tabs = (
    [
      { id: 'cards', label: ui.wanted.tabs.cards(left.copies) },
      { id: 'basics', label: ui.wanted.tabs.basics },
      { id: 'tokens', label: ui.wanted.tokens }
    ] as const
  ).filter(({ id }) => id === 'cards' || (id === 'basics' ? basics.length > 0 : wishlists.length > 0))
  const tab = tabs.some(({ id }) => id === storedTab) ? storedTab : 'cards'
  const copyable = tab === 'cards' ? visible.length > 0 : tab === 'basics'
  const completers = overview.cards.filter((card) => card.completes.length > 0).length

  /** Stamps in motion: Ordered lifting off, Acquired showing or lifting off. */
  const [lifting, setLifting] = useState<ReadonlySet<string>>(new Set())
  const [acquiring, setAcquiring] = useState<ReadonlySet<string>>(new Set())
  const [unacquiring, setUnacquiring] = useState<ReadonlySet<string>>(new Set())
  const motion: StampMotion = { landing, lifting, acquiring, unacquiring }
  /** The latest stamps, for what finishes after a motion. */
  const orderedNow = useRef(ordered)
  orderedNow.current = ordered
  /** What finishes each motion, by `kind:key`: run when it ends, or at once when the page closes. */
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; finish: () => void }>())
  const later = (id: string, ms: number, finish: () => void) => {
    const timer = setTimeout(() => {
      pending.current.delete(id)
      finish()
    }, ms)
    pending.current.set(id, { timer, finish })
  }
  useEffect(
    () => () => {
      for (const { timer, finish } of [...pending.current.values()]) {
        clearTimeout(timer)
        finish()
      }
      pending.current.clear()
    },
    []
  )

  /** Acquired: the stamp shows for {@link ACQUIRE_MS}, then the copies go to the Inventory. A second click within that time lifts the stamp off instead. */
  const markBought = (card: WantedCard) => {
    if (unacquiring.has(card.key)) return
    const id = `acquire:${card.key}`
    const due = pending.current.get(id)
    if (due) {
      clearTimeout(due.timer)
      pending.current.delete(id)
      setUnacquiring((keys) => withKey(keys, card.key))
      later(`unacquire:${card.key}`, LIFT_MS, () => {
        setAcquiring((keys) => withoutKey(keys, card.key))
        setUnacquiring((keys) => withoutKey(keys, card.key))
      })
      return
    }
    setAcquiring((keys) => withKey(keys, card.key))
    later(id, ACQUIRE_MS, () => {
      actions.setOwned(card.name, card.owned + card.toBuy)
      toast(ui.wanted.markedBought(card.toBuy, card.name))
      setAcquiring((keys) => withoutKey(keys, card.key))
    })
  }

  /** Ordered: the stamp lands; on a stamped card, it lifts off first, then goes. */
  const stamp = (card: WantedCard) => {
    if (lifting.has(card.key)) return
    if (fullyOrdered(card, ordered)) {
      setLifting((keys) => withKey(keys, card.key))
      later(`lift:${card.key}`, LIFT_MS, () => {
        actions.setOrdered(withStamp(orderedNow.current, card.key, 0, today))
        toast(ui.wanted.unstamped(card.name))
        setLifting((keys) => withoutKey(keys, card.key))
      })
      return
    }
    actions.setOrdered(withStamp(ordered, card.key, card.toBuy, today))
    toast(ui.wanted.stamped(card.toBuy - orderedCopies(card, ordered), card.name))
    setLanding((keys) => withKey(keys, card.key))
    clearTimeout(landed.current)
    landed.current = setTimeout(() => setLanding(new Set()), LANDING_MS)
  }
  const copyText = useCopy()
  const copy = (text: string, what: string) => copyText(text, ui.wanted.copied(what))
  const copyTab = () => {
    const cards = (tab === 'cards' ? visible : basics).map((card) => ({ qty: card.toBuy - orderedCopies(card, ordered), name: card.name }))
    void copy(countLines(cards.filter((card) => card.qty > 0)).join('\n'), tab === 'cards' ? ui.wanted.cardsToBuy : ui.wanted.basicLands)
  }

  return (
    <div className="view wanted-view">
      <header className="view-header">
        <div>
          <h1>{ui.wanted.title}</h1>
          {!noLists && (
            <p className="muted">
              {ui.wanted.summary(left.copies, formatEur(left.total), withDecks)}
              {overview.loading > 0 && ui.wanted.stillLoading(overview.loading)}
              {completers > 0 && ui.wanted.completers(completers)}
              {left.ordered > 0 && (
                <span className="on-the-way">
                  {' · '}
                  <Icon name="stamp" /> {ui.wanted.onTheWay(left.ordered)}
                </span>
              )}
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

      {left.cards.length > 0 && <BudgetPlanner overview={overview} ordered={ordered} today={today} actions={actions} onCopy={copy} />}

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
          stamps={ordered}
          today={today}
          motion={motion}
          onStamp={stamp}
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
          stamps={ordered}
          today={today}
          motion={motion}
          onStamp={stamp}
          onOpenList={onOpenList}
        />
      )}
      {tab === 'tokens' && <TokensTab wishlists={wishlists} meta={meta} onOpenList={onOpenList} onCopy={copy} />}
    </div>
  )
}
