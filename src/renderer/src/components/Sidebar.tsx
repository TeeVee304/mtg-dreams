import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { listColor } from '@shared/listColor'
import { sumOf, totalCopies } from '@shared/totals'
import { matchTrades, type TradeCard, type TradeSnapshot, type Want } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { ui } from '@shared/text'
import { inventoryValue } from '../lib/collection'
import { formatDate, formatEur } from '../lib/format'
import { sameList, type CardList, type ListRef } from '../stores/library'
import { useBaselines } from '../stores/history'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { listFigures } from '../lib/listFigures'
import { MANA_SYMBOLS, THEME_ICONS } from '../lib/artwork'
import { wantedOverview } from '../lib/wanted'
import { useCopyPool } from '../hooks/useCopyPool'
import { useNarrow } from '../hooks/useNarrow'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { DeckWizardNavItem } from '../features/deckWizard'
import { Icon } from './Icon'
import { PriceMoves } from './PriceMoves'

/** Brews shown before "Show all". */
const BREWS_SHOWN = 5
/** Brews past which their section gets a filter. */
const BREW_FILTER_FROM = 10

/** Main page selection; `paste` opens the inventory's text editor (from the welcome screen). */
export type View =
  | { page: 'inventory'; paste?: boolean }
  | { page: 'wanted' }
  | { page: 'list'; list: ListRef }
  | { page: 'trade'; friend: string }

/** Props of {@link Sidebar}. */
interface SidebarProps {
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  view: View | null
  onSelect: (view: View) => void
  onNew: (kind: ListKind) => void
  /** Moves a wishlist to place `to` in the order (0 is the top). */
  onMoveWishlist: (list: ListRef, to: number) => void
  /** Makes a wishlist a brew, or a brew a wishlist at place `at` in the order. */
  onMoveKind: (list: ListRef, to: 'wishlist' | 'brew', at?: number) => void
  onSettings: () => void
  /** Publication time of the Cardmarket price guide in use; null if none yet. */
  pricedAt: number | null
  /** Checks Cardmarket for newer prices. */
  onRefreshPrices: () => Promise<void>
  trades: TradeSnapshot[]
  /** Own trade side ({@link myTradeSide}). */
  myTrade: { haves: TradeCard[]; wants: Want[] }
  onShareTrade: () => void
  onImportTrade: () => void
  /** Opens the Deck Wizard. */
  onWizard: () => void
  /** The Deck Wizard is open; its item shines. */
  wizardOpen: boolean
}

/**
 * Navigation: inventory and Most Wanted stay in place; decks, wishlists and brews (collapsible sections
 * with price-drop counts and color symbols on hover; wishlists in your order, dragged to reorder; brews
 * by name, the first few until all are shown, with a filter for many; a list dragged between Wishlists
 * and Brews changes kind) and trades scroll below them. The footer holds the price status and settings. In narrow windows it is an icon rail: icons and list initials, with
 * every list shown and names in tooltips (and for screen readers).
 */
export function Sidebar(props: SidebarProps) {
  const { lists, inventory, view, onSelect, onNew, onMoveWishlist, onMoveKind, onSettings, pricedAt, onRefreshPrices } = props
  const { trades, myTrade, onShareTrade, onImportTrade, onWizard, wizardOpen } = props
  const [refreshing, setRefreshing] = useState(false)
  /**
   * Wishlist or brew being dragged (`from`: a wishlist's place in the order), and where it would drop:
   * a place among the wishlists (`at`), or into Brews.
   */
  const [drag, setDrag] = useState<{ list: ListRef; from: number | null; into: 'wishlist' | 'brew' | null; at: number | null } | null>(null)
  const rail = useNarrow()
  const version = usePrintingsVersion()
  const settings = useSettings()
  const baselines = useBaselines()
  const [decksOpen, toggleDecks] = useStoredToggle('mtg-dreams.decksOpen', true)
  const [wishlistsOpen, toggleWishlists] = useStoredToggle('mtg-dreams.wishlistsOpen', true)
  const [brewsOpen, toggleBrews] = useStoredToggle('mtg-dreams.brewsOpen', true)
  /** Every brew is shown, not just the first few. */
  const [allBrews, setAllBrews] = useState(false)
  const [brewFilter, setBrewFilter] = useState('')
  const pool = useCopyPool(lists)
  const wanted = wantedOverview(lists, inventory, settings, pool)
  const worth = inventoryValue(inventory, settings.bundleBasics)
  /** Each list's figures; recomputed when the data or prices change, not when navigating. */
  const figures = useMemo(
    () => new Map(lists.map((list) => [list, listFigures(list, inventory, settings, baselines, pool)])),
    // `version` stands for the prices the figures are read from.
    [lists, inventory, settings, baselines, pool, version]
  )
  const tradeCounts = useMemo(
    () => trades.map((trade) => matchTrades(myTrade.haves, myTrade.wants, trade)),
    [trades, myTrade]
  )

  /** Drops the dragged list where it is over: in its new place among the wishlists, or into Brews. */
  const drop = () => {
    if (drag?.into === 'wishlist' && drag.at !== null) {
      if (drag.from !== null) onMoveWishlist(drag.list, drag.at > drag.from ? drag.at - 1 : drag.at)
      else onMoveKind(drag.list, 'wishlist', drag.at)
    } else if (drag?.into === 'brew' && drag.list.kind === 'wishlist') {
      onMoveKind(drag.list, 'brew')
    }
    setDrag(null)
  }

  /**
   * Drag handlers of a wishlist at `index` in the order, or of a brew: a wishlist drops the dragged list
   * above or below it by pointer half; over a brew, its section takes the drop ({@link dropZone}).
   */
  const dragProps = (list: CardList, index: number) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', list.name)
      setDrag({ list: { kind: list.kind, name: list.name }, from: list.kind === 'wishlist' ? index : null, into: null, at: null })
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!drag || list.kind !== 'wishlist') return
      event.preventDefault()
      event.stopPropagation()
      const box = event.currentTarget.getBoundingClientRect()
      const at = index + (event.clientY > box.top + box.height / 2 ? 1 : 0)
      if (at !== drag.at || drag.into !== 'wishlist') setDrag({ ...drag, into: 'wishlist', at })
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      drop()
    },
    onDragEnd: () => setDrag(null)
  })

  /**
   * Drop handlers of the Wishlists or Brews section as a whole: a brew dropped on Wishlists (its title,
   * or past its lists) joins them first or last; a wishlist dropped on Brews becomes a brew.
   */
  const dropZone = (kind: 'wishlist' | 'brew', count: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!drag || (kind === 'brew' && drag.list.kind !== 'wishlist')) return
      event.preventDefault()
      const onTitle = (event.target as HTMLElement).closest('.nav-section') !== null
      const at = kind === 'wishlist' ? (onTitle ? 0 : count) : null
      if (drag.into !== kind || drag.at !== at) setDrag({ ...drag, into: kind, at })
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      drop()
    }
  })

  const renderList = (list: CardList, index: number) => {
    const { format, summary, mainCards, size, cheaper, pricier, colors, art } = figures.get(list)!
    const isWishlist = list.kind === 'wishlist'
    const isBrew = list.kind === 'brew'
    const over = isWishlist && drag?.into === 'wishlist'
    const dropMark = over && drag.at === index ? ' drop-before' : over && drag.at === index + 1 ? ' drop-after' : ''
    const dragged = drag !== null && sameList(drag.list, list)
    const active = view?.page === 'list' && sameList(view.list, list)
    const priced = summary.loading === 0 && summary.cards > 0
    const complete = list.kind === 'wishlist' && summary.cards > 0 && summary.ownedCards >= summary.cards
    const collected = summary.cards > 0 ? Math.round((summary.ownedCards / summary.cards) * 100) : 0
    return (
      <button
        key={`${list.kind}/${list.name}`}
        type="button"
        className={`nav-item${isBrew ? ' brew' : ''}${active ? ' active' : ''}${dragged ? ' dragging' : ''}${dropMark}`}
        data-color={listColor(list.lines) ?? undefined}
        style={colors.length > 0 ? ({ '--colors': colors.length } as CSSProperties) : undefined}
        title={rail ? list.name : undefined}
        onClick={() => onSelect({ page: 'list', list: { kind: list.kind, name: list.name } })}
        {...(isWishlist || isBrew ? dragProps(list, index) : {})}
      >
        <span className="nav-thumb" aria-hidden="true">
          {art && settings.cardImages ? <img src={art} alt="" loading="lazy" draggable={false} /> : <Initials name={list.name} />}
        </span>
        <span className="nav-text">
        <span className="nav-title-row">
          <span className="nav-name">{list.name}</span>
          <PriceMoves cheaper={cheaper} pricier={pricier} />
        </span>
        {list.kind === 'wishlist' && !complete && summary.cards > 0 && (
          <span className="nav-progress" aria-hidden="true">
            <span style={{ width: `${Math.max(collected, 2)}%` }} />
          </span>
        )}
        {colors.length > 0 && (
          <span className="nav-colors" aria-label={ui.sidebar.colors(colors.join(', '))}>
            {colors.map((color) => (
              <img key={color} src={MANA_SYMBOLS[color]} alt="" draggable={false} />
            ))}
          </span>
        )}
        <span className="nav-meta" title={priced ? (list.kind === 'deck' ? ui.sidebar.worth(formatEur(summary.total)) : undefined) : undefined}>
          {list.kind === 'deck' ? (
            <>
              {format && `${format.label} · `}
              {size ? (
                <span className={size.status === 'ok' ? undefined : 'warn'} title={size.note ?? undefined}>
                  {ui.sidebar.deckSize(size.label)}
                </span>
              ) : (
                ui.count.cards(mainCards)
              )}
            </>
          ) : isBrew ? (
            settings.plainBrews ? (
              `${ui.count.cards(summary.cards)}${priced ? ` · ${formatEur(summary.total)}` : ''}`
            ) : (
              ui.sidebar.ownedOf(summary.ownedCards, summary.cards)
            )
          ) : complete ? (
            <span className="nav-complete">{ui.sidebar.complete(summary.cards)}</span>
          ) : (
            ui.sidebar.progress(summary.ownedCards, summary.cards, priced ? formatEur(summary.neededValue) : null)
          )}
        </span>
        </span>
      </button>
    )
  }

  const section = (kind: ListKind, title: string, empty: string) => {
    const items = lists.filter((list) => list.kind === kind)
    const label = ui.sidebar.newList(ui.terms.kinds[kind])
    const toggles = { deck: [decksOpen, toggleDecks], wishlist: [wishlistsOpen, toggleWishlists], brew: [brewsOpen, toggleBrews] } as const
    // The rail has no room for folding: it always shows every list.
    const [open, toggle] = rail ? [true, () => {}] : toggles[kind]
    // Brews can be many: the first few until all are shown, filtered by name once there are more than ten.
    const brews = kind === 'brew' && !rail
    const query = brews && items.length > BREW_FILTER_FROM ? brewFilter.trim().toLowerCase() : ''
    const matching = query ? items.filter((list) => list.name.toLowerCase().includes(query)) : items
    const shown = brews && !allBrews && !query ? matching.slice(0, BREWS_SHOWN) : matching
    // A drop on the section itself: into Brews, or onto an empty Wishlists.
    const dropInto = drag?.into === kind && (kind === 'brew' || items.length === 0)
    return (
      <div className="nav-group" {...(kind === 'deck' ? {} : dropZone(kind, items.length))}>
        <div className={`nav-section${dropInto ? ' drop-into' : ''}`}>
          <span className="nav-section-title">
            {title}
            {!open && items.length > 0 && <span className="nav-section-count"> · {items.length}</span>}
          </span>
          <span className="nav-section-actions">
            <button type="button" className="icon-btn" onClick={() => onNew(kind)} title={label} aria-label={label}>
              <Icon name="plus" />
            </button>
            {!rail && (
              <button
                type="button"
                className={`icon-btn nav-section-toggle${open ? ' open' : ''}`}
                onClick={toggle}
                aria-expanded={open}
                title={open ? ui.sidebar.collapse(title) : ui.sidebar.show(title)}
                aria-label={open ? ui.sidebar.collapse(title) : ui.sidebar.show(title)}
              >
                <Icon name="chevron" />
              </button>
            )}
          </span>
        </div>
        {open && items.length === 0 && <p className="muted nav-empty">{empty}</p>}
        {open && brews && items.length > BREW_FILTER_FROM && (
          <input
            type="search"
            className="nav-filter"
            placeholder={ui.sidebar.findBrewPlaceholder}
            aria-label={ui.sidebar.findBrew}
            value={brewFilter}
            onChange={(event) => setBrewFilter(event.target.value)}
          />
        )}
        {open && shown.map(renderList)}
        {open && brews && !query && items.length > BREWS_SHOWN && (
          <button type="button" className="link-btn nav-more" onClick={() => setAllBrews(!allBrews)}>
            {allBrews ? ui.sidebar.showFewer : ui.sidebar.showAll(items.length)}
          </button>
        )}
      </div>
    )
  }

  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`}>
      <div className="brand">
        <img className="brand-mark" src={THEME_ICONS[settings.color]} alt="" draggable={false} />
        <span className="brand-name">{ui.app.name}</span>
      </div>

      <nav className="nav-fixed">
        <button
          type="button"
          className={`nav-item${view?.page === 'inventory' ? ' active' : ''}`}
          title={rail ? ui.sidebar.inventory : undefined}
          onClick={() => onSelect({ page: 'inventory' })}
        >
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="backpack" />
          </span>
          <span className="nav-text">
            <span className="nav-name">{ui.sidebar.inventory}</span>
            <span className="nav-meta">
              {ui.count.cards(worth.copies)}
              {inventory.size > 0 && worth.pending === 0 && ` · ${formatEur(worth.total)}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`nav-item${view?.page === 'wanted' ? ' active' : ''}`}
          title={rail ? ui.sidebar.mostWanted : undefined}
          onClick={() => onSelect({ page: 'wanted' })}
        >
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="cart" />
          </span>
          <span className="nav-text">
            <span className="nav-name">{ui.sidebar.mostWanted}</span>
            <span className="nav-meta">
              {ui.count.cards(sumOf(wanted.cards, (card) => card.toBuy))}
              {wanted.cards.length > 0 && wanted.loading === 0 && ` · ${formatEur(wanted.total)}`}
            </span>
          </span>
        </button>
        <DeckWizardNavItem onOpen={onWizard} open={wizardOpen} rail={rail} />
      </nav>

      <nav className="nav-scroll">
        {section('deck', ui.terms.kindsPlural.deck, ui.sidebar.noDecks)}
        {section('wishlist', ui.terms.kindsPlural.wishlist, ui.sidebar.noWishlists)}
        {section('brew', ui.terms.kindsPlural.brew, ui.sidebar.brewsHint)}
      </nav>

      {/* Trades stay in view under the lists, however long those get. */}
      <nav className="nav-trades" aria-label={ui.sidebar.trades}>
        <div className="nav-section">
          <span className="nav-section-title">{ui.sidebar.trades}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onImportTrade}
            title={ui.sidebar.importTrade}
            aria-label={ui.sidebar.importTrade}
          >
            <Icon name="plus" />
          </button>
        </div>
        <button type="button" className="nav-item share-item" onClick={onShareTrade} title={rail ? ui.sidebar.shareTrade : undefined}>
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="share" />
          </span>
          <span className="nav-text">
            <span className="nav-name">{ui.sidebar.shareTrade}</span>
          </span>
        </button>
        {trades.map((trade, index) => {
          const { forMe, forThem } = tradeCounts[index]
          const active = view?.page === 'trade' && view.friend === trade.name
          return (
            <button
              key={trade.name}
              type="button"
              className={`nav-item${active ? ' active' : ''}`}
              title={rail ? ui.sidebar.tradeWith(trade.name) : undefined}
              onClick={() => onSelect({ page: 'trade', friend: trade.name })}
            >
              <span className="nav-thumb" aria-hidden="true">
                <Initials name={trade.name} />
              </span>
              <span className="nav-text">
                <span className="nav-name">{trade.name}</span>
                <span className="nav-meta">
                  {ui.sidebar.tradeCounts(totalCopies(forMe), totalCopies(forThem))}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="sidebar-foot">
        <div className="foot-row price-status">
          <span className="muted small">{pricedAt ? ui.sidebar.pricesFrom(formatDate(pricedAt)) : ui.sidebar.noPrices}</span>
          <button
            type="button"
            className="link-btn small"
            disabled={refreshing}
            title={ui.sidebar.refreshHint}
            onClick={() => {
              setRefreshing(true)
              void onRefreshPrices().finally(() => setRefreshing(false))
            }}
          >
            {refreshing ? ui.sidebar.checking : ui.sidebar.refresh}
          </button>
        </div>
        <button type="button" className="settings-btn" onClick={onSettings} title={rail ? ui.sidebar.settings : undefined}>
          <Icon name="settings" /> <span className="nav-label">{ui.sidebar.settings}</span>
        </button>
      </footer>
    </aside>
  )
}

/** A list's or friend's initials, standing in for the name in the rail. */
function Initials({ name }: { name: string }) {
  const words = name.split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return (
    <span className="nav-initials" aria-hidden="true">
      {letters}
    </span>
  )
}
