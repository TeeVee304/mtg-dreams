import type { ComponentProps } from 'react'
import { pairByType } from '@shared/cards'
import type { Swaps } from '@shared/listVersion'
import type { CardInfo, CardLine, Printing } from '@shared/types'
import { ui } from '@shared/text'
import { formatEur } from '../lib/format'
import type { Row } from '../lib/summary'
import { getCardInfo } from '../stores/cardinfo'
import { cheapestVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'
import { CardSearch, type SearchChoice } from './CardSearch'
import { previewHandlers } from './HoverPreview'
import { Icon } from './Icon'
import { ListAddCards, useCardAdder } from './ListAddCards'
import { CardThumb } from './Placeholders'

/** Props of {@link SwapTable}. */
interface SwapTableProps {
  /** What the version or upgrade changes: its cards out and its cards in. */
  swaps: Swaps
  /** What changes from what, said under the title: `What the Duel Version changes from the Commander Version`. */
  changes: string
  /** Where the cards out come from: `Cut from the Commander Version`. */
  outLabel: string
  /** Where the cards in go: `Only in the Duel Version`. */
  inLabel: string
  /** What it is, for undo labels: `Duel Version`, `Upgrade`. */
  target: string
  /** Said while nothing changes. */
  none: string
  /** Rows of the version or upgrade, for the printing, price and copies owned of its cards in. */
  rows: Row[]
  /** Shows whether you own each card in, and what is left to buy (upgrades). */
  ownership?: boolean
  /** Cards it can cut. */
  outChoices: SearchChoice[]
  /** Cuts a copy of a card. */
  onCut: (name: string) => void
  /** Puts a card out back in. */
  onKeep: (line: CardLine) => void
  /** Takes a card in back out. */
  onDrop: (line: CardLine) => void
  /** Adding a card in, as on the list page. */
  adder: Omit<ComponentProps<typeof ListAddCards>, 'onAddPrecon' | 'onAdding'>
  /** Placeholder of the search adding a card in, when it doesn't search the inventory. */
  addPlaceholder: string
}

/** A side of a swap: a card, priced. */
interface Priced {
  line: CardLine
  /** Card data; none until it loads. */
  info: CardInfo | null | undefined
  /** The row of a card in, when the list shows it. */
  row: Row | undefined
  unit: number | null
  images: Printing | null
}

/** @returns The value of priced cards, unknown prices aside. */
const valueOf = (cards: Priced[]) => cards.reduce((sum, card) => sum + (card.unit ?? 0) * card.line.qty, 0)

/** @returns Copies of priced cards. */
const copiesOf = (cards: Priced[]) => cards.reduce((sum, card) => sum + card.line.qty, 0)

/** @returns Copies of a card in still to get: those of its line the inventory doesn't cover, at most its copies in. */
const needOf = (card: Priced) => (card.row ? Math.min(card.line.qty, card.row.line.qty - card.row.owned) : card.line.qty)

/** The undo button of a swap's card. */
const UndoButton = ({ label, title, onClick }: { label: string; title: string; onClick: () => void }) => (
  <button type="button" className="icon-btn swap-undo" onClick={onClick} aria-label={label} title={title}>
    <Icon name="close" />
  </button>
)

/** The arrow from the cards out to the cards in. */
const SwapArrow = () => (
  <span className="swap-arrow" aria-hidden="true">
    <Icon name="arrow" />
  </span>
)

/** A side of a swap row: a card (thumbnail, name and type, ownership if asked, price) and its undo button, or a blank. */
function SwapSide({ card, kind, ownership, undo }: { card: Priced | null; kind: 'out' | 'in'; ownership: boolean; undo: UndoProps | null }) {
  if (!card || !undo) {
    return (
      <div className="swap-side">
        <div className={`swap-card ${kind} empty-side`}>{ui.swaps.blank}</div>
      </div>
    )
  }
  const need = ownership ? needOf(card) : 0
  return (
    <div className="swap-side">
      <div
        className={`swap-card ${kind}`}
        {...previewHandlers({ src: card.images?.imageNormal, back: card.images?.imageBack, name: card.line.name, foil: card.line.foil })}
      >
        <CardThumb src={card.images?.imageSmall} foil={card.line.foil} />
        <span className="swap-card-name">
          <strong>
            {card.line.qty > 1 && <span className="swap-qty">{card.line.qty}× </span>}
            {card.line.name}
          </strong>
          <span className="muted small">{card.info?.typeLine}</span>
        </span>
        {ownership && (
          <span className={`swap-owned${need > 0 ? ' need' : ''}`}>{need > 0 ? ui.swaps.need(need) : ui.swaps.owned}</span>
        )}
        <span className="swap-price">{card.unit === null ? '—' : formatEur(card.unit * card.line.qty)}</span>
      </div>
      <UndoButton {...undo} />
    </div>
  )
}

/** A card's undo button: its label, tooltip and action. */
interface UndoProps {
  label: string
  title: string
  onClick: () => void
}

/**
 * A version or an upgrade as what it changes (Out → In), lined up by type so each card cut sits
 * beside a card of its type added instead ({@link pairByType}). The rows aren't stored pairs: each
 * card is undone on its own, and a card out and a card in can be picked apart.
 */
export function SwapTable(props: SwapTableProps) {
  const { swaps, rows, ownership = false } = props
  const { priceBasis, bundleBasics } = useSettings()
  const { choices, pickCard, panel } = useCardAdder({ ...props.adder, onAdding: () => {} })

  /** A card in priced as its row shows it; a card out (or one without a row) at its cheapest printing. */
  const priced = (line: CardLine, own: boolean): Priced => {
    const info = getCardInfo(line.name, bundleBasics)
    const row = own ? rows.find((other) => other.line.id === line.id || other.bundledIds?.includes(line.id)) : undefined
    if (row) return { line, info, row, unit: row.unit, images: row.resolution?.printing ?? null }
    const cheapest = cheapestVersion(line.name, priceBasis)
    return { line, info, row, unit: cheapest?.unit ?? null, images: cheapest?.printing ?? null }
  }
  const outs = swaps.outs.map((line) => priced(line, false))
  const ins = swaps.ins.map((line) => priced(line, true))
  const lined = pairByType(outs, ins, (card) => ({ name: card.line.name, info: card.info }))
  const outValue = valueOf(outs)
  const inValue = valueOf(ins)
  const difference = inValue - outValue
  const missing = ins.reduce((sum, card) => sum + needOf(card), 0)
  const toFinish = ins.reduce((sum, card) => sum + needOf(card) * (card.unit ?? 0), 0)

  const keep = (card: Priced): UndoProps => ({
    label: ui.swaps.keep(card.line.name, props.target),
    title: ui.swaps.keepHint,
    onClick: () => props.onKeep(card.line)
  })
  const drop = (card: Priced): UndoProps => ({
    label: ui.swaps.drop(card.line.name, props.target),
    title: ui.swaps.dropHint,
    onClick: () => props.onDrop(card.line)
  })

  return (
    <section className="swaps" aria-labelledby="swaps-title">
      <div className="swaps-head">
        <h2 id="swaps-title">{ui.swaps.title}</h2>
        <span className="muted small">{props.changes}</span>
        <span className="spacer" />
        <span className="muted small">{ui.swaps.counts(copiesOf(outs), copiesOf(ins))}</span>
      </div>

      <div className="swap-grid swap-labels">
        <span>
          <strong>{ui.swaps.out}</strong> {props.outLabel}
        </span>
        <span />
        <span>
          <strong className="swap-in">{ui.swaps.in}</strong> {props.inLabel}
        </span>
      </div>

      {lined.length === 0 && <p className="swaps-empty muted">{props.none}</p>}

      {lined.map((row) => (
        <div className="swap-grid swap-row" key={`${row.out?.line.id ?? '-'} ${row.in?.line.id ?? '-'}`}>
          <SwapSide card={row.out} kind="out" ownership={false} undo={row.out && keep(row.out)} />
          <SwapArrow />
          <SwapSide card={row.in} kind="in" ownership={ownership} undo={row.in && drop(row.in)} />
        </div>
      ))}

      <div className="swap-grid swap-add">
        <CardSearch id="swap-out-search" placeholder={ui.swaps.cut} choices={props.outChoices} onPick={props.onCut} />
        <SwapArrow />
        <CardSearch placeholder={choices ? ui.swaps.addFromInventory : props.addPlaceholder} choices={choices} onPick={pickCard} />
      </div>
      {panel && <div className="swap-panel">{panel}</div>}

      {lined.length > 0 && (
        <div className="swap-grid swap-totals">
          <span>
            {ui.swaps.totalOut(copiesOf(outs))} <span className="swap-price">{formatEur(outValue)}</span>
          </span>
          <span />
          <span>
            {ui.swaps.totalIn(copiesOf(ins))}{' '}
            <span className="swap-price">
              <strong>{formatEur(inValue)}</strong>{' '}
              <span className="muted">
                ({difference >= 0 ? '+' : '−'}
                {formatEur(Math.abs(difference))})
              </span>
            </span>
          </span>
          {ownership && (
            <>
              <span />
              <span />
              <span className="swap-finish">
                {ui.swaps.toFinish(missing)} <strong className="swap-price">{formatEur(toFinish)}</strong>
              </span>
            </>
          )}
        </div>
      )}
    </section>
  )
}
