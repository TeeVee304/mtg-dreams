import { useMemo, useState, type CSSProperties } from 'react'
import { listColor } from '@shared/listColor'
import { sumOf, totalCopies } from '@shared/totals'
import { matchTrades, type TradeCard, type TradeSnapshot, type Want } from '@shared/trade'
import type { InventoryItem, ListKind } from '@shared/types'
import { inventoryValue } from '../lib/collection'
import { cardCount, formatDate, formatEur } from '../lib/format'
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
  /** Opens the Deck Wizard. */
  onWizard: () => void
  /** The Deck Wizard is open; its item shines. */
  wizardOpen: boolean
}

/**
 * Navigation: inventory and Most Wanted stay in place; decks and wishlists (collapsible sections with
 * price-drop counts and color symbols on hover) and trades scroll below them. The footer holds the
 * price status and settings. In narrow windows it is an icon rail: icons and list initials, with
 * every list shown and names in tooltips (and for screen readers).
 */
export function Sidebar(props: SidebarProps) {
  const { lists, inventory, view, onSelect, onNew, onSettings, pricedAt, onRefreshPrices } = props
  const { trades, myTrade, onShareTrade, onImportTrade, onWizard, wizardOpen } = props
  const [refreshing, setRefreshing] = useState(false)
  const rail = useNarrow()
  const version = usePrintingsVersion()
  const settings = useSettings()
  const baselines = useBaselines()
  const [decksOpen, toggleDecks] = useStoredToggle('mtg-dreams.decksOpen', true)
  const [wishlistsOpen, toggleWishlists] = useStoredToggle('mtg-dreams.wishlistsOpen', true)
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

  const renderList = (list: CardList) => {
    const { format, summary, mainCards, size, cheaper, colors, art } = figures.get(list)!
    const active = view?.page === 'list' && sameList(view.list, list)
    const priced = summary.loading === 0 && summary.cards > 0
    const complete = list.kind === 'wishlist' && summary.cards > 0 && summary.ownedCards >= summary.cards
    const collected = summary.cards > 0 ? Math.round((summary.ownedCards / summary.cards) * 100) : 0
    return (
      <button
        key={`${list.kind}/${list.name}`}
        type="button"
        className={`nav-item${active ? ' active' : ''}`}
        data-color={listColor(list.lines) ?? undefined}
        style={colors.length > 0 ? ({ '--colors': colors.length } as CSSProperties) : undefined}
        title={rail ? list.name : undefined}
        onClick={() => onSelect({ page: 'list', list: { kind: list.kind, name: list.name } })}
      >
        <span className="nav-thumb" aria-hidden="true">
          {art && settings.cardImages ? <img src={art} alt="" loading="lazy" draggable={false} /> : <Initials name={list.name} />}
        </span>
        <span className="nav-text">
        <span className="nav-name">{list.name}</span>
        {list.kind === 'wishlist' && !complete && summary.cards > 0 && (
          <span className="nav-progress" aria-hidden="true">
            <span style={{ width: `${Math.max(collected, 2)}%` }} />
          </span>
        )}
        {colors.length > 0 && (
          <span className="nav-colors" aria-label={`Colors: ${colors.join(', ')}`}>
            {colors.map((color) => (
              <img key={color} src={MANA_SYMBOLS[color]} alt="" draggable={false} />
            ))}
          </span>
        )}
        <span className="nav-meta" title={priced ? (list.kind === 'deck' ? `Worth ${formatEur(summary.total)}` : undefined) : undefined}>
          {list.kind === 'deck' ? (
            <>
              {format && `${format.label} · `}
              {size ? (
                <span className={size.status === 'ok' ? undefined : 'warn'} title={size.note ?? undefined}>
                  {size.label} cards
                </span>
              ) : (
                cardCount(mainCards)
              )}
            </>
          ) : complete ? (
            <span className="nav-complete">✓ Complete · {cardCount(summary.cards)}</span>
          ) : (
            `${summary.ownedCards} of ${summary.cards}${priced ? ` · ${formatEur(summary.neededValue)} to go` : ''}`
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
        </span>
      </button>
    )
  }

  const section = (kind: ListKind, title: string, empty: string) => {
    const items = lists.filter((list) => list.kind === kind)
    const label = kind === 'deck' ? 'New deck' : 'New wishlist'
    // The rail has no room for folding: it always shows every list.
    const [open, toggle] = rail ? [true, () => {}] : kind === 'deck' ? [decksOpen, toggleDecks] : [wishlistsOpen, toggleWishlists]
    return (
      <>
        <div className="nav-section">
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
                title={open ? `Collapse ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
                aria-label={open ? `Collapse ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
              >
                <Icon name="chevron" />
              </button>
            )}
          </span>
        </div>
        {open && items.length === 0 && <p className="muted nav-empty">{empty}</p>}
        {open && items.map(renderList)}
      </>
    )
  }

  return (
    <aside className={`sidebar${rail ? ' rail' : ''}`}>
      <div className="brand">
        <img className="brand-mark" src={THEME_ICONS[settings.color]} alt="" draggable={false} />
        <span className="brand-name">MTG Dreams</span>
      </div>

      <nav className="nav-fixed">
        <button
          type="button"
          className={`nav-item${view?.page === 'inventory' ? ' active' : ''}`}
          title={rail ? 'Inventory' : undefined}
          onClick={() => onSelect({ page: 'inventory' })}
        >
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="backpack" />
          </span>
          <span className="nav-text">
            <span className="nav-name">Inventory</span>
            <span className="nav-meta">
              {cardCount(worth.copies)}
              {inventory.size > 0 && worth.pending === 0 && ` · ${formatEur(worth.total)}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          className={`nav-item${view?.page === 'wanted' ? ' active' : ''}`}
          title={rail ? 'Most Wanted' : undefined}
          onClick={() => onSelect({ page: 'wanted' })}
        >
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="cart" />
          </span>
          <span className="nav-text">
            <span className="nav-name">Most Wanted</span>
            <span className="nav-meta">
              {cardCount(sumOf(wanted.cards, (card) => card.toBuy))}
              {wanted.cards.length > 0 && wanted.loading === 0 && ` · ${formatEur(wanted.total)}`}
            </span>
          </span>
        </button>
        <DeckWizardNavItem onOpen={onWizard} open={wizardOpen} rail={rail} />
      </nav>

      <nav className="nav-scroll">
        {section('deck', 'Decks', 'No decks yet.')}
        {section('wishlist', 'Wishlists', 'No wishlists yet.')}

        <div className="nav-section">
          <span className="nav-section-title">Trades</span>
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
        <button type="button" className="nav-item share-item" onClick={onShareTrade} title={rail ? 'Share my trade list' : undefined}>
          <span className="nav-thumb nav-tile" aria-hidden="true">
            <Icon name="share" />
          </span>
          <span className="nav-text">
            <span className="nav-name">Share my trade list</span>
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
              title={rail ? `Trade with ${trade.name}` : undefined}
              onClick={() => onSelect({ page: 'trade', friend: trade.name })}
            >
              <span className="nav-thumb" aria-hidden="true">
                <Initials name={trade.name} />
              </span>
              <span className="nav-text">
                <span className="nav-name">{trade.name}</span>
                <span className="nav-meta">
                  {totalCopies(forMe)} for you · {totalCopies(forThem)} for them
                </span>
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
        <button type="button" className="settings-btn" onClick={onSettings} title={rail ? 'Settings' : undefined}>
          <Icon name="settings" /> <span className="nav-label">Settings</span>
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
