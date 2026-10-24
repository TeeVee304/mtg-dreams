import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { listId, type CopyPool } from '@shared/copies'
import { nameKey } from '@shared/decklist'
import { listColor } from '@shared/listColor'
import { heldWhere } from '@shared/listModel'
import { priceBasisLabel } from '@shared/pricing'
import { sumOf, totalCopies } from '@shared/totals'
import { keptMatches, matchTrades, type MyTradeSide, type TradeMatch, type TradeSnapshot } from '@shared/trade'
import type { PriceBasis, Printing } from '@shared/types'
import { ui } from '@shared/text'
import { formatDate, formatEur, timeAgo } from '../lib/format'
import type { CardList, LibraryActions, ListRef } from '../stores/library'
import { cheapestVersion, requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { ListChip, Price } from './CardCells'
import { ConfirmDialog, PromptDialog } from './Dialogs'
import { previewHandlers } from './HoverPreview'
import { MenuButton } from './MenuButton'
import { SummaryItem } from './SummaryItem'
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

/** Copies of a match that count in the balance: those with a value. */
const valued = (match: TradeMatch) => match.qty - match.worthless

/** Sort by total value, descending. */
const byValue = (a: PricedMatch, b: PricedMatch) =>
  (b.unit ?? -1) * valued(b) - (a.unit ?? -1) * valued(a) || a.name.localeCompare(b.name)

/** EUR total of priced matches, worthless copies aside. */
const totalOf = (matches: PricedMatch[]) => sumOf(matches, (m) => (m.unit ?? 0) * valued(m))
/** Matched copy count label. */

/** Props of {@link TradeView}. */
interface TradeViewProps {
  trade: TradeSnapshot
  /** Own trade side ({@link myTradeSide}). */
  myTrade: MyTradeSide
  /** Copy claims of all lists: which lists keep your copies. */
  pool: CopyPool
  /** Decks and wishlists, for their colors. */
  lists: CardList[]
  actions: LibraryActions
  onOpenList: (list: ListRef) => void
  /** Opens import to update this friend's list. */
  onUpdate: () => void
  onRenamed: (name: string) => void
}

/**
 * Friend trade page: cards they can give and cards they want, priced; requests prices for matched
 * cards only. Only spare copies are offered; wants that only copies your lists keep could cover are
 * shown apart, outside the balance.
 */
export function TradeView({ trade, myTrade, pool, lists, actions, onOpenList, onUpdate, onRenamed }: TradeViewProps) {
  const toast = useToast()
  usePrintingsVersion()
  const { priceBasis } = useSettings()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)

  const { forMe, forThem } = useMemo(() => matchTrades(myTrade.haves, myTrade.wants, trade), [myTrade, trade])
  const keptOnly = useMemo(() => keptMatches(myTrade.haves, myTrade.kept, trade), [myTrade, trade])
  const spareOf = useMemo(() => new Map(myTrade.haves.map((card) => [nameKey(card.name), card.qty])), [myTrade])
  const keptOf = useMemo(() => new Map(myTrade.kept.map((card) => [nameKey(card.name), card.qty])), [myTrade])
  const ownedOf = (name: string) => (spareOf.get(nameKey(name)) ?? 0) + (keptOf.get(nameKey(name)) ?? 0)
  const colors = useMemo(() => new Map(lists.map((list) => [listId(list), listColor(list.lines)])), [lists])

  const names = [...forMe, ...forThem, ...keptOnly].map((match) => match.name).join('\n')
  useEffect(() => {
    for (const name of names.split('\n')) if (name) requestPrintings(name, { priority: 'high' })
  }, [names])

  const receive = forMe.map((match) => price(match, priceBasis)).sort(byValue)
  const give = forThem.map((match) => price(match, priceBasis)).sort(byValue)
  const kept = keptOnly.map((match) => price(match, priceBasis)).sort(byValue)
  const receiveTotal = totalOf(receive)
  const giveTotal = totalOf(give)
  const loading = [...receive, ...give].some((match) => match.unit === undefined)
  const balance = receiveTotal - giveTotal
  const even = Math.abs(balance) < 0.005
  const date = new Date(trade.createdAt)
  const text = ui.trades

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>{text.title(trade.name)}</h1>
          <p className="muted">
            {text.listFrom(trade.name, formatDate(date.getTime()), timeAgo(date.getTime()), totalCopies(trade.haves), totalCopies(trade.wants))}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onUpdate}>
            {text.update}
          </button>
          <MenuButton
            label={text.more}
            items={[
              { label: text.rename, onSelect: () => setDialog('rename') },
              { label: text.remove, onSelect: () => setDialog('delete'), danger: true }
            ]}
          />
        </div>
      </header>

      {trade.source === 'list' && (
        <p className="trade-note muted small">
          {trade.wants.length === 0 ? text.plainList(trade.name) : text.plainLists}
        </p>
      )}

      <section className="summary-strip">
        <SummaryItem
          label={text.canGiveYou(trade.name)}
          value={formatEur(receiveTotal)}
          accent
          note={text.yourListsNeed(totalCopies(receive))}
        />
        <SummaryItem label={text.youCanGive(trade.name)} value={formatEur(giveTotal)} note={text.onTheirLists(totalCopies(give))} />
        <SummaryItem
          label={text.balance}
          value={even ? text.even : `${balance > 0 ? '+' : '−'}${formatEur(Math.abs(balance))}`}
          note={loading ? text.pricing : even ? text.bothEven : balance > 0 ? text.yourFavour : text.theirFavour(trade.name)}
        />
      </section>

      <div className="trade-columns">
        <section>
          <h2 className="section-heading trade-heading">{text.theyHave(trade.name)}</h2>
          {receive.length > 0 ? (
            <MatchTable
              matches={receive}
              detail={(m) => (
                <div className="chips">
                  {m.lists.map((list) => (
                    <ListChip
                      key={listId(list)}
                      color={colors.get(listId(list)) ?? null}
                      onClick={() => onOpenList(list)}
                      title={list.kind === 'deck' ? text.deckChip(list.name) : undefined}
                    >
                      {list.name}
                    </ListChip>
                  ))}
                </div>
              )}
              detailLabel={text.wantedBy}
              qtyNote={(m) => (m.available < m.needed ? text.theyHaveYouNeed(m.available, m.needed) : undefined)}
            />
          ) : (
            <p className="empty-note muted">{text.noneOfTheirs(trade.name)}</p>
          )}
        </section>
        <section>
          <h2 className="section-heading trade-heading">{text.youHave(trade.name)}</h2>
          {give.length > 0 ? (
            <MatchTable
              matches={give}
              detail={(m) => {
                const owned = ownedOf(m.name)
                return <span className="muted owned-detail">{text.owned(owned, owned > m.available ? m.available : null)}</span>
              }}
              detailLabel={text.youOwn}
              qtyNote={(m) => (m.available < m.needed ? text.theyNeed(m.needed) : undefined)}
            />
          ) : (
            <p className="empty-note muted">
              {trade.wants.length === 0 ? text.noLists(trade.name) : text.noneOfYours(trade.name)}
            </p>
          )}
          {kept.length > 0 && (
            <div className="trade-kept">
              <p className="muted small">{text.kept(trade.name)}</p>
              <MatchTable
                matches={kept}
                detail={(m) => <span className="muted owned-detail">{text.owned(ownedOf(m.name), null)}</span>}
                detailLabel={text.youOwn}
                qtyNote={(m) => {
                  const owned = ownedOf(m.name)
                  return text.keptWhere(heldWhere(pool.usedBy(nameKey(m.name), owned), owned), m.available < m.needed ? m.needed : null)
                }}
              />
            </div>
          )}
        </section>
      </div>
      <p className="muted tiny trade-footnote">{text.footnote(priceBasisLabel(priceBasis))}</p>

      {dialog === 'rename' && (
        <PromptDialog
          title={text.renameTitle}
          label={text.friendName}
          initial={trade.name}
          confirmLabel={text.renameConfirm}
          onClose={() => setDialog(null)}
          onSubmit={async (value) => {
            onRenamed(await actions.renameTrade(trade.name, value))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={text.removeTitle}
          message={text.removeMessage(trade.name)}
          confirmLabel={text.removeConfirm}
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await actions.deleteTrade(trade.name)
            toast(text.removed(trade.name))
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
          <th className="col-trade-qty">{ui.trades.columns.qty}</th>
          <th>{ui.trades.columns.card}</th>
          <th>{detailLabel}</th>
          <th className="col-num">{ui.trades.columns.value}</th>
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
              {match.worthless > 0 && (
                <span className="chip worthless" title={ui.trades.worthlessHint}>
                  {ui.trades.worthless(match.worthless, match.worthless === match.qty)}
                </span>
              )}
            </td>
            <td>{detail(match)}</td>
            <td className="col-num">
              {match.worthless === match.qty ? <span className="muted">—</span> : <Price unit={match.unit} qty={valued(match)} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
