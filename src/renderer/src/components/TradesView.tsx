import { useMemo } from 'react'
import { totalCopies } from '@shared/totals'
import { matchTrades, type MyTradeSide, type TradeSnapshot } from '@shared/trade'
import { ui } from '@shared/text'
import { formatDate, timeAgo } from '../lib/format'

/** Props of {@link TradesView}. */
interface TradesViewProps {
  trades: TradeSnapshot[]
  /** Own trade side ({@link myTradeSide}). */
  myTrade: MyTradeSide
  onOpenTrade: (friend: string) => void
  onShareTrade: () => void
  onImportTrade: () => void
}

/** Trades page: sharing your list, importing a friend's, and every friend's list with its matches. */
export function TradesView({ trades, myTrade, onOpenTrade, onShareTrade, onImportTrade }: TradesViewProps) {
  const text = ui.trades.hub
  const counts = useMemo(() => trades.map((trade) => matchTrades(myTrade.haves, myTrade.wants, trade)), [trades, myTrade])

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>{ui.sidebar.trades}</h1>
          <p className="muted">{text.summary}</p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onImportTrade}>
            {text.import}
          </button>
          <button type="button" className="primary" onClick={onShareTrade}>
            {ui.sidebar.shareTrade}
          </button>
        </div>
      </header>

      {trades.length === 0 ? (
        <div className="empty">
          <p>{text.none}</p>
          <p className="muted">{text.noneHint}</p>
        </div>
      ) : (
        <table className="cards-table">
          <thead>
            <tr>
              <th>{text.friend}</th>
              <th>{text.listFrom}</th>
              <th className="col-num">{text.forYou}</th>
              <th className="col-num">{text.forThem}</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => {
              const time = new Date(trade.createdAt).getTime()
              return (
                <tr key={trade.name}>
                  <td className="col-name">
                    <button type="button" className="link-btn" onClick={() => onOpenTrade(trade.name)}>
                      {trade.name}
                    </button>
                  </td>
                  <td className="muted">{`${formatDate(time)} (${timeAgo(time)})`}</td>
                  <td className="col-num">{ui.count.cards(totalCopies(counts[index].forMe))}</td>
                  <td className="col-num">{ui.count.cards(totalCopies(counts[index].forThem))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
