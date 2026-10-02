import { cardLines } from '../../../shared/decklist'
import { listFormat } from '../../../shared/formats'
import { matchTrades, type TradeCard, type TradeSnapshot, type Want } from '../../../shared/trade'
import type { InventoryItem, ListKind } from '../../../shared/types'
import { cardCount, formatEur } from '../format'
import { sameList, type CardList, type ListRef } from '../library'
import { priceDrop, useBaselines } from '../history'
import { usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'
import { buildRows, summarize } from '../summary'
import { THEME_ICONS } from '../artwork'
import { Icon } from './Icon'


/** Main page selection. */
export type View = { page: 'inventory' } | { page: 'list'; list: ListRef } | { page: 'trade'; friend: string }

/** Props of {@link Sidebar}. */
interface SidebarProps {
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  view: View | null
  dataDir: string
  onSelect: (view: View) => void
  onNew: (kind: ListKind) => void
  onOpenDataDir: () => void
  onChangeDataDir: () => void
  onSettings: () => void
  onCollectionValue: () => void
  trades: TradeSnapshot[]
  /** Own trade side ({@link myTradeSide}). */
  myTrade: { haves: TradeCard[]; wants: Want[] }
  onShareTrade: () => void
  onImportTrade: () => void
}

/** Navigation: inventory, decks, wishlists (with price-drop counts) and trades; data folder and settings actions. */
export function Sidebar(props: SidebarProps) {
  const { lists, inventory, view, dataDir, onSelect, onNew, onOpenDataDir, onChangeDataDir, onSettings, onCollectionValue } =
    props
  const { trades, myTrade, onShareTrade, onImportTrade } = props
  usePrintingsVersion()
  const settings = useSettings()
  const baselines = useBaselines()

  const renderList = (list: CardList) => {
    const rows = buildRows(cardLines(list.lines), inventory, settings)
    const summary = summarize(rows)
    const cheaper =
      list.kind === 'wishlist'
        ? rows.filter(
            (row) =>
              !row.bundledIds &&
              priceDrop(row.line, row.unit, row.owned, settings.priceBasis, settings.dropAlertPercent, baselines)
          ).length
        : 0
    const format = listFormat(list.lines)
    const active = view?.page === 'list' && sameList(view.list, list)
    const priced = summary.loading === 0 && summary.cards > 0
    const complete = list.kind === 'wishlist' && summary.cards > 0 && summary.ownedCards >= summary.cards
    return (
      <button
        key={`${list.kind}/${list.name}`}
        type="button"
        className={`nav-item${active ? ' active' : ''}`}
        onClick={() => onSelect({ page: 'list', list: { kind: list.kind, name: list.name } })}
      >
        <span className="nav-name">{list.name}</span>
        <span className="nav-meta">
          {format && `${format.label} · `}
          {list.kind === 'deck' ? (
            `${cardCount(summary.cards)}${priced ? ` · ${formatEur(summary.total)}` : ''}`
          ) : complete ? (
            <span className="nav-complete">✓ Complete · {cardCount(summary.cards)}</span>
          ) : (
            `${summary.ownedCards}/${summary.cards}${priced ? ` · ${formatEur(summary.neededValue)}` : ''}`
          )}
          {cheaper > 0 && (
            <span className="nav-cheaper" title={`${cheaper} still needed ${cheaper === 1 ? 'card got' : 'cards got'} cheaper since added`}>
              {' '}
              · ↓ {cheaper} cheaper
            </span>
          )}
        </span>
      </button>
    )
  }

  const section = (kind: ListKind, title: string, empty: string) => {
    const items = lists.filter((list) => list.kind === kind)
    const label = kind === 'deck' ? 'New deck' : 'New wishlist'
    return (
      <>
        <div className="nav-section">
          <span>{title}</span>
          <button type="button" className="icon-btn" onClick={() => onNew(kind)} title={label} aria-label={label}>
            <Icon name="plus" />
          </button>
        </div>
        {items.length === 0 && <p className="muted nav-empty">{empty}</p>}
        {items.map(renderList)}
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

      <nav>
        <button
          type="button"
          className={`nav-item${view?.page === 'inventory' ? ' active' : ''}`}
          onClick={() => onSelect({ page: 'inventory' })}
        >
          <span className="nav-name">Inventory</span>
          <span className="nav-meta">{cardCount(inventory.size)}</span>
        </button>
        <button type="button" className="value-btn" onClick={onCollectionValue} title="What is my collection worth?">
          <Icon name="sparkle" /> Inventory Value
        </button>
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
                {forMe.length} for you · {forThem.length} for them
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="sidebar-foot">
        <div className="foot-row">
          <span className="muted small" title={dataDir}>
            Data folder
          </span>
          <button type="button" className="link-btn" onClick={onOpenDataDir}>
            Open
          </button>
          <button type="button" className="link-btn" onClick={onChangeDataDir}>
            Change…
          </button>
        </div>
        <span className="muted tiny">Card data &amp; images © Scryfall / Wizards of the Coast</span>
        <button type="button" className="settings-btn" onClick={onSettings}>
          <Icon name="settings" /> Settings
        </button>
      </footer>
    </aside>
  )
}
