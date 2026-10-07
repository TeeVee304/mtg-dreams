import { useState, type CSSProperties } from 'react'
import type { ColorFilter } from '@shared/cards'
import { STAT_COLORS } from '@shared/deckStats'
import { cardLines, nameKey } from '@shared/decklist'
import { deckSizeCheck, listCommander, listFormat } from '@shared/formats'
import { listColor } from '@shared/listColor'
import { sideboardIds } from '@shared/sideboard'
import { matchTrades, type TradeCard, type TradeSnapshot, type Want } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { VALUATION_BASIS, valueCollection } from '../lib/collection'
import { cardCount, formatDate, formatEur, totalCopies } from '../lib/format'
import { sameList, type CardList, type ListRef } from '../stores/library'
import { priceDrop, useBaselines } from '../stores/history'
import { usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { buildRows, summarize } from '../lib/summary'
import { MANA_SYMBOLS, THEME_ICONS } from '../lib/artwork'
import { wantedOverview } from '../lib/wanted'
import { useCopyPool } from '../hooks/useCopyPool'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { Icon } from './Icon'

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
}

/**
 * Navigation: inventory and Most Wanted stay in place; decks and wishlists (collapsible sections with
 * price-drop counts and color symbols on hover) and trades scroll below them. The footer holds the
 * price status and settings.
 */
export function Sidebar(props: SidebarProps) {
  const { lists, inventory, view, onSelect, onNew, onSettings, pricedAt, onRefreshPrices } = props
  const { trades, myTrade, onShareTrade, onImportTrade } = props
  const [refreshing, setRefreshing] = useState(false)
  usePrintingsVersion()
  const settings = useSettings()
  const baselines = useBaselines()
  const [decksOpen, toggleDecks] = useStoredToggle('mtg-dreams.decksOpen', true)
  const [wishlistsOpen, toggleWishlists] = useStoredToggle('mtg-dreams.wishlistsOpen', true)
  const wanted = wantedOverview(lists, inventory, settings)
  const pool = useCopyPool(lists)
  const worth = valueCollection(inventory, VALUATION_BASIS, settings.bundleBasics)

  const renderList = (list: CardList) => {
    const format = listFormat(list.lines)
    const sideIds = sideboardIds(list.lines, !format?.commander)
    const rows = buildRows(cardLines(list.lines), inventory, settings, sideIds, (key) => pool.held(list, key))
    const summary = summarize(rows)
    const mainCards = totalCopies(rows.filter((row) => !row.side).map((row) => row.line))
    const size = list.kind === 'deck' && format ? deckSizeCheck(format, mainCards) : null
    const cheaper =
      list.kind === 'wishlist'
        ? rows.filter(
            (row) =>
              !row.bundledIds &&
              priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)
          ).length
        : 0
    const active = view?.page === 'list' && sameList(view.list, list)
    const colors = listColors(rows, format?.commander ? listCommander(list.lines) : null)
    const priced = summary.loading === 0 && summary.cards > 0
    const complete = list.kind === 'wishlist' && summary.cards > 0 && summary.ownedCards >= summary.cards
    return (
      <button
        key={`${list.kind}/${list.name}`}
        type="button"
        className={`nav-item${active ? ' active' : ''}`}
        data-color={listColor(list.lines) ?? undefined}
        style={colors.length > 0 ? ({ '--colors': colors.length } as CSSProperties) : undefined}
        onClick={() => onSelect({ page: 'list', list: { kind: list.kind, name: list.name } })}
      >
        <span className="nav-name">{list.name}</span>
        {colors.length > 0 && (
          <span className="nav-colors" aria-label={`Colors: ${colors.join(', ')}`}>
            {colors.map((color) => (
              <img key={color} src={MANA_SYMBOLS[color]} alt="" draggable={false} />
            ))}
          </span>
        )}
        <span className="nav-meta">
          {format && `${format.label} · `}
          {list.kind === 'deck' ? (
            <>
              {size ? (
                <span className={size.status === 'ok' ? undefined : 'warn'} title={size.note ?? undefined}>
                  {size.label} cards
                </span>
              ) : (
                cardCount(mainCards)
              )}
              {priced && ` · ${formatEur(summary.total)}`}
            </>
          ) : complete ? (
            <span className="nav-complete">✓ Complete · {cardCount(summary.cards)}</span>
          ) : (
            `${summary.ownedCards}/${summary.cards}${priced ? ` · ${formatEur(summary.neededValue)}` : ''}`
          )}
        </span>
        {cheaper > 0 && (
          <span
            className="nav-meta nav-cheaper"
            title={`${cheaper} still needed ${cheaper === 1 ? 'card got' : 'cards got'} cheaper since added`}
          >
            ↓ {cheaper} cheaper
          </span>
        )}
      </button>
    )
  }

  const section = (kind: ListKind, title: string, empty: string) => {
    const items = lists.filter((list) => list.kind === kind)
    const label = kind === 'deck' ? 'New deck' : 'New wishlist'
    const [open, toggle] = kind === 'deck' ? [decksOpen, toggleDecks] : [wishlistsOpen, toggleWishlists]
    return (
      <>
        <div className="nav-section">
          <span>
            {title}
            {!open && items.length > 0 && <span className="nav-section-count"> · {items.length}</span>}
          </span>
          <span className="nav-section-actions">
            <button type="button" className="icon-btn" onClick={() => onNew(kind)} title={label} aria-label={label}>
              <Icon name="plus" />
            </button>
            <button
              type="button"
              className={`icon-btn nav-section-toggle${open ? ' open' : ''}`}
              onClick={toggle}
              aria-expanded={open}
              title={open ? `Collapse ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
              aria-label={open ? `Collapse ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
            >
              <Icon name="chevron" />
            </button>
          </span>
        </div>
        {open && items.length === 0 && <p className="muted nav-empty">{empty}</p>}
        {open && items.map(renderList)}
      </>
    )
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src={THEME_ICONS[settings.color]} alt="" draggable={false} />
        <span>
          MTG Dreams<small>Decks · wishlists · EUR prices</small>
        </span>
      </div>

      <nav className="nav-fixed">
        <button
          type="button"
          className={`nav-item${view?.page === 'inventory' ? ' active' : ''}`}
          onClick={() => onSelect({ page: 'inventory' })}
        >
          <span className="nav-name nav-icon-name">
            Inventory <Icon name="backpack" />
          </span>
          <span className="nav-meta">
            {cardCount(worth.copies)}
            {inventory.size > 0 && worth.pending === 0 && ` · ${formatEur(worth.total)}`}
          </span>
        </button>
        <button
          type="button"
          className={`nav-item${view?.page === 'wanted' ? ' active' : ''}`}
          onClick={() => onSelect({ page: 'wanted' })}
        >
          <span className="nav-name nav-icon-name">
            Most Wanted <Icon name="cart" />
          </span>
          <span className="nav-meta">
            {cardCount(totalCopies(wanted.cards.map((card) => ({ qty: card.toBuy }))))}
            {wanted.cards.length > 0 && wanted.loading === 0 && ` · ${formatEur(wanted.total)}`}
          </span>
        </button>
      </nav>

      <nav className="nav-scroll">
        {section('deck', 'Decks', 'No decks yet.')}
        {section('wishlist', 'Wishlists', 'No wishlists yet.')}

        <div className="nav-section">
          <span>Trades</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onImportTrade}
            title="Import a friend's trade list"
            aria-label="Import a friend's trade list"
          >
            <Icon name="plus" />
          </button>
        </div>
        <button type="button" className="nav-item share-item" onClick={onShareTrade}>
          <span className="nav-name">
            <Icon name="share" /> Share my trade list
          </span>
        </button>
        {trades.map((trade) => {
          const { forMe, forThem } = matchTrades(myTrade.haves, myTrade.wants, trade)
          const active = view?.page === 'trade' && view.friend === trade.name
          return (
            <button
              key={trade.name}
              type="button"
              className={`nav-item${active ? ' active' : ''}`}
              onClick={() => onSelect({ page: 'trade', friend: trade.name })}
            >
              <span className="nav-name">{trade.name}</span>
              <span className="nav-meta">
                {totalCopies(forMe)} for you · {totalCopies(forThem)} for them
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="sidebar-foot">
        <div className="foot-row price-status">
          <span className="muted small">{pricedAt ? `Prices from ${formatDate(pricedAt)}` : 'No prices yet'}</span>
          <button
            type="button"
            className="link-btn small"
            disabled={refreshing}
            title="Check Cardmarket for a newer price guide (also checked hourly)"
            onClick={() => {
              setRefreshing(true)
              void onRefreshPrices().finally(() => setRefreshing(false))
            }}
          >
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        <button type="button" className="settings-btn" onClick={onSettings}>
          <Icon name="settings" /> Settings
        </button>
      </footer>
    </aside>
  )
}

/**
 * @param rows - List rows, with card data once loaded.
 * @param commander - Commander name in commander formats; its color identity decides alone.
 * @returns Color identity in WUBRG order: the commander's, else the union of the cards'. `C` when that
 * identity is empty: a colorless commander, or a list whose cards are all colorless (once all have loaded).
 */
function listColors(rows: Array<{ line: { name: string }; info?: { colorIdentity: string[] } | null }>, commander: string | null): ColorFilter[] {
  if (commander) {
    const info = rows.find((row) => nameKey(row.line.name) === nameKey(commander))?.info
    if (!info) return []
    return info.colorIdentity.length === 0 ? ['C'] : STAT_COLORS.filter((color) => info.colorIdentity.includes(color))
  }
  const identity = new Set(rows.flatMap((row) => row.info?.colorIdentity ?? []))
  if (identity.size > 0) return STAT_COLORS.filter((color) => identity.has(color))
  const loaded = rows.length > 0 && rows.every((row) => row.info !== undefined) && rows.some((row) => row.info)
  return loaded ? ['C'] : []
}
