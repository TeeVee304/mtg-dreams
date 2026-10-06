import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { priceBasisLabel } from '@shared/pricing'
import { matchTrades, type TradeCard, type TradeMatch, type TradeSnapshot, type Want } from '@shared/trade'
import type { PriceBasis, Printing } from '@shared/types'
import { cardCount, formatEur, timeAgo } from '../lib/format'
import type { LibraryActions, ListRef } from '../stores/library'
import { cheapestVersion, requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { ConfirmDialog, PromptDialog } from './Dialogs'
import { previewHandlers } from './HoverPreview'
import { useToast } from './Toasts'

/** Match with cheapest-printing price. */
interface PricedMatch extends TradeMatch {
  /** EUR unit price; undefined while loading, null if unpriced. */
  unit: number | null | undefined
  printing: Printing | null
}

/** @returns Match priced at its cheapest non-foil printing. */
function price(match: TradeMatch, basis: PriceBasis): PricedMatch {
  const cheapest = cheapestVersion(match.name, basis)
  return { ...match, unit: cheapest?.unit, printing: cheapest?.printing ?? null }
}

/** Sort by total value, descending. */
const byValue = (a: PricedMatch, b: PricedMatch) =>
  (b.unit ?? -1) * b.qty - (a.unit ?? -1) * a.qty || a.name.localeCompare(b.name)

/** EUR total of priced matches. */
const totalOf = (matches: PricedMatch[]) => matches.reduce((sum, m) => sum + (m.unit ?? 0) * m.qty, 0)
/** Matched copy count label. */
const matchedCards = (matches: TradeMatch[]) => cardCount(matches.reduce((sum, m) => sum + m.qty, 0))

/** Props of {@link TradeView}. */
interface TradeViewProps {
  trade: TradeSnapshot
  /** Own trade side ({@link myTradeSide}). */
  myTrade: { haves: TradeCard[]; wants: Want[] }
  actions: LibraryActions
  onOpenList: (list: ListRef) => void
  /** Opens import to update this friend's list. */
  onUpdate: () => void
  onRenamed: (name: string) => void
}

/** Friend trade page: cards they can give and cards they want, priced; requests prices for matched cards only. */
export function TradeView({ trade, myTrade, actions, onOpenList, onUpdate, onRenamed }: TradeViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  const { priceBasis } = useSettings()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)

  const { forMe, forThem } = useMemo(() => matchTrades(myTrade.haves, myTrade.wants, trade), [myTrade, trade])

  const names = [...forMe, ...forThem].map((match) => match.name).join('\n')
  useEffect(() => {
    for (const name of names.split('\n')) if (name) requestPrintings(name, { priority: 'high' })
  }, [names])

  const receive = forMe.map((match) => price(match, priceBasis)).sort(byValue)
  const give = forThem.map((match) => price(match, priceBasis)).sort(byValue)
  const receiveTotal = totalOf(receive)
  const giveTotal = totalOf(give)
  const loading = [...receive, ...give].some((match) => match.unit === undefined)
  const balance = receiveTotal - giveTotal
  const date = new Date(trade.createdAt)

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Trading with {trade.name}</h1>
          <p className="muted">
            {trade.name}'s list from {date.toLocaleDateString()} ({timeAgo(date.getTime())}) · {cardCount(trade.haves.length)}
            they have · {trade.wants.length} they want
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onUpdate}>
            Update from file…
          </button>
          <button type="button" onClick={() => setDialog('rename')}>
            Rename
          </button>
          <button type="button" className="danger-ghost" onClick={() => setDialog('delete')}>
            Remove
          </button>
        </div>
      </header>

      {trade.source === 'list' && (
        <p className="trade-note muted small">
          {trade.wants.length === 0
            ? `Imported from a plain card list, so it only says what ${trade.name} has. Ask them to share their list from MTG Dreams to see what they want too.`
            : 'Imported from plain card lists.'}
        </p>
      )}

      <section className="stats">
        <div className="stat accent">
          <span className="stat-label">{trade.name} can give you</span>
          <span className="stat-value">{formatEur(receiveTotal)}</span>
          <span className="stat-note">{matchedCards(receive)} your wishlists need</span>
        </div>
        <div className="stat">
          <span className="stat-label">You can give {trade.name}</span>
          <span className="stat-value">{formatEur(giveTotal)}</span>
          <span className="stat-note">{matchedCards(give)} on their wishlist</span>
        </div>
        <div className="stat">
          <span className="stat-label">Balance</span>
          <span className="stat-value">
            {Math.abs(balance) < 0.005 ? 'Even' : `${balance > 0 ? '+' : '−'}${formatEur(Math.abs(balance))}`}
          </span>
          <span className="stat-note">
            {loading
              ? 'Pricing cards…'
              : Math.abs(balance) < 0.005
                ? 'Both sides are worth the same'
                : balance > 0
                  ? 'in your favour'
                  : `in ${trade.name}'s favour`}
          </span>
        </div>
      </section>

      <div className="trade-columns">
        <section>
          <h3 className="trade-heading">{trade.name} has, your wishlists need</h3>
          {receive.length > 0 ? (
            <MatchTable
              matches={receive}
              detail={(m) => (
                <div className="chips">
                  {m.lists.map((list) => (
                    <button
                      key={`${list.kind}/${list.name}`}
                      type="button"
                      className="chip link"
                      onClick={() => onOpenList(list)}
                      title={list.kind === 'deck' ? `Deck ${list.name}` : undefined}
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              )}
              detailLabel="Wanted by"
              qtyNote={(m) => (m.available < m.needed ? `they have ${m.available}, you need ${m.needed}` : undefined)}
            />
          ) : (
            <p className="empty-note muted">None of {trade.name}'s cards are on your wishlists.</p>
          )}
        </section>
        <section>
          <h3 className="trade-heading">You have, {trade.name}'s wishlist needs</h3>
          {give.length > 0 ? (
            <MatchTable
              matches={give}
              detail={(m) => <span className="muted">{m.available} owned</span>}
              detailLabel="You own"
              qtyNote={(m) => (m.available < m.needed ? `they need ${m.needed}` : undefined)}
            />
          ) : (
            <p className="empty-note muted">
              {trade.wants.length === 0
                ? `${trade.name} didn't share a wishlist.`
                : `None of your cards are on ${trade.name}'s wishlist.`}
            </p>
          )}
        </section>
      </div>
      <p className="muted tiny trade-footnote">
        Values use each card's cheapest version at Cardmarket prices ({priceBasisLabel(priceBasis)}). Basic lands are
        left out.
      </p>

      {dialog === 'rename' && (
        <PromptDialog
          title="Rename trade list"
          label="Friend's name"
          initial={trade.name}
          confirmLabel="Rename"
          onClose={() => setDialog(null)}
          onSubmit={async (value) => {
            onRenamed(await actions.renameTrade(trade.name, value))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Remove trade list"
          message={`Move ${trade.name}'s trade list to the Recycle Bin? You can import it again any time.`}
          confirmLabel="Remove"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await actions.deleteTrade(trade.name)
            toast(`Removed ${trade.name}'s trade list`)
          }}
        />
      )}
    </div>
  )
}

/** Props of {@link MatchTable}. */
interface MatchTableProps {
  matches: PricedMatch[]
  /** Detail column cell. */
  detail: (match: PricedMatch) => ReactNode
  /** Detail column header. */
  detailLabel: string
  /** Quantity tooltip. */
  qtyNote: (match: PricedMatch) => string | undefined
}

/** Table of priced matches. */
function MatchTable({ matches, detail, detailLabel, qtyNote }: MatchTableProps) {
  return (
    <table className="cards-table trade-table">
      <thead>
        <tr>
          <th className="col-trade-qty">Qty</th>
          <th>Card</th>
          <th>{detailLabel}</th>
          <th className="col-num">Value</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => (
          <tr key={match.name}>
            <td className="col-trade-qty">
              <strong>{match.qty}</strong>
            </td>
            <td className="col-name" {...previewHandlers({ src: match.printing?.imageNormal, back: match.printing?.imageBack, name: match.name })}>
              <span className="card-name">{match.name}</span>
              {qtyNote(match) && <span className="muted tiny trade-qty-note">{qtyNote(match)}</span>}
            </td>
            <td>{detail(match)}</td>
            <td className="col-num strong">
              {match.unit === undefined ? (
                <span className="muted">…</span>
              ) : match.unit === null ? (
                '—'
              ) : (
                formatEur(match.unit * match.qty)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
