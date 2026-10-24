import type { ComponentProps, ReactNode } from 'react'
import { compareInListOrder } from '@shared/cards'
import type { SwapPair, Swaps, Variant } from '@shared/listVersion'
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

/** Adding a card in, as on the list page. */
type Adder = Omit<ComponentProps<typeof ListAddCards>, 'onAddPrecon' | 'onAdding'>

/** Props of {@link SwapTable}. */
interface SwapTableProps {
  /** The version's swaps, paired: what it cuts, and what it plays instead. */
  pairs: SwapPair[]
  /** The version: Duel, EDH, or a named one. */
  variant: Variant
  /** The list itself, named: `Commander`, `Duel`, `Main`. */
  baseLabel: string
  /** Rows of the version, for the printing and price of its cards in. */
  rows: Row[]
  /** Cards of the version it can cut: the list's, but its commander and its cards in. */
  outChoices: SearchChoice[]
  /** Cuts a copy of a card. */
  onCut: (name: string) => void
  /** Undoes a pair of swaps, by index. */
  onUndo: (index: number) => void
  /** Adding a card in, as on the list page; additions become swaps. */
  adder: Adder
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

/**
 * @param rows - Rows of the list the cards in belong to.
 * @returns Prices a swap's card: a card in as its row shows it; a card out (or one without a row) at
 * its cheapest printing.
 */
function usePricing(rows: Row[]) {
  const { priceBasis, bundleBasics } = useSettings()
  return (line: CardLine, own: boolean): Priced => {
    const info = getCardInfo(line.name, bundleBasics)
    const row = own ? rows.find((other) => other.line.id === line.id || other.bundledIds?.includes(line.id)) : undefined
    if (row) return { line, info, row, unit: row.unit, images: row.resolution?.printing ?? null }
    const cheapest = cheapestVersion(line.name, priceBasis)
    return { line, info, row, unit: cheapest?.unit ?? null, images: cheapest?.printing ?? null }
  }
}

/** Swaps in a list's order: by type section, then mana value, then name. */
const inListOrder = (a: Priced, b: Priced) =>
  compareInListOrder({ name: a.line.name, info: a.info }, { name: b.line.name, info: b.info })

/** @returns The value of priced cards, unknown prices aside. */
const valueOf = (cards: Priced[]) => cards.reduce((sum, card) => sum + (card.unit ?? 0) * card.line.qty, 0)

/** @returns Copies of priced cards. */
const copiesOf = (cards: Priced[]) => cards.reduce((sum, card) => sum + card.line.qty, 0)

/** A swap's card: thumbnail, name and type, an optional note, and price. */
function SwapCard({ card, kind, note }: { card: Priced; kind: 'out' | 'in'; note?: ReactNode }) {
  return (
    <div className={`swap-card ${kind}`} {...previewHandlers({ src: card.images?.imageNormal, back: card.images?.imageBack, name: card.line.name })}>
      <CardThumb src={card.images?.imageSmall} />
      <span className="swap-card-name">
        <strong>
          {card.line.qty > 1 && <span className="swap-qty">{card.line.qty}× </span>}
          {card.line.name}
        </strong>
        <span className="muted small">{card.info?.typeLine}</span>
      </span>
      {note}
      <span className="swap-price">{card.unit === null ? '—' : formatEur(card.unit * card.line.qty)}</span>
    </div>
  )
}

/** A side of a pair with no card: the other side has more swaps. */
const EmptySide = ({ kind }: { kind: 'out' | 'in' }) => (
  <div className={`swap-card ${kind} empty-side`}>{kind === 'out' ? ui.swaps.nothingCut : ui.swaps.nothingIn}</div>
)

/** The undo button of a swap. */
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

/**
 * A version as what it changes (Out → In): each card it cuts beside the card it plays instead, the
 * pairs as made, listed in the list's order by their card out. Picking a card out and a card in adds
 * a pair, filling an uneven last one first; each pair is undone at once.
 */
export function SwapTable({ pairs, variant, baseLabel, rows, outChoices, onCut, onUndo, adder }: SwapTableProps) {
  const { choices, pickCard, panel } = useCardAdder({ ...adder, onAdding: () => {} })
  const priced = usePricing(rows)

  // Pairs stay as made, listed by their card out (by their card in when nothing is cut); each keeps its index for undo.
  const sides = pairs
    .map((pair, index) => ({ index, out: pair.out && priced(pair.out, false), in: pair.in && priced(pair.in, true) }))
    .sort((a, b) => inListOrder((a.out ?? a.in)!, (b.out ?? b.in)!))
  const outs = sides.flatMap((pair) => (pair.out ? [pair.out] : []))
  const ins = sides.flatMap((pair) => (pair.in ? [pair.in] : []))
  const outValue = valueOf(outs)
  const inValue = valueOf(ins)
  const difference = inValue - outValue

  return (
    <section className="swaps" aria-labelledby="swaps-title">
      <div className="swaps-head">
        <h2 id="swaps-title">{ui.swaps.title}</h2>
        <span className="muted small">{ui.swaps.changes(variant.label, baseLabel)}</span>
        <span className="spacer" />
        <span className="muted small">{ui.swaps.counts(copiesOf(outs), copiesOf(ins))}</span>
      </div>

      <div className="swap-grid swap-labels">
        <span>
          <strong>{ui.swaps.out}</strong> {ui.swaps.cutFrom(baseLabel)}
        </span>
        <span />
        <span>
          <strong className="swap-in">{ui.swaps.in}</strong> {ui.swaps.onlyIn(variant.label)}
        </span>
        <span />
      </div>

      {sides.length === 0 && (
        <p className="swaps-empty muted">{ui.swaps.none(variant.label)}</p>
      )}

      {sides.map((pair) => (
        <div className="swap-grid swap-row" key={`${pair.out?.line.id ?? '-'} ${pair.in?.line.id ?? '-'}`}>
          {pair.out ? <SwapCard card={pair.out} kind="out" /> : <EmptySide kind="out" />}
          <SwapArrow />
          {pair.in ? <SwapCard card={pair.in} kind="in" /> : <EmptySide kind="in" />}
          <UndoButton
            onClick={() => onUndo(pair.index)}
            label={ui.swaps.undo([pair.out?.line.name, pair.in?.line.name].filter(Boolean).join(ui.swaps.swapFor))}
            title={ui.swaps.undoHint}
          />
        </div>
      ))}

      <div className="swap-grid swap-add">
        <CardSearch id="swap-out-search" placeholder={ui.swaps.cut} choices={outChoices} onPick={onCut} />
        <SwapArrow />
        <CardSearch
          placeholder={choices ? ui.swaps.addFromInventory : ui.swaps.addInstead}
          choices={choices}
          onPick={pickCard}
        />
        <span />
      </div>
      {panel && <div className="swap-panel">{panel}</div>}

      {sides.length > 0 && (
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
          <span />
        </div>
      )}
    </section>
  )
}

/** Props of {@link UpgradeSwapTable}. */
interface UpgradeSwapTableProps {
  /** What the upgrade changes in its deck. */
  swaps: Swaps
  /** The deck it upgrades, named: `Elves`, or `Elves (Duel Version)`. */
  deckLabel: string
  /** Rows of the upgrade, for the printing, price and copies owned of its cards in. */
  rows: Row[]
  /** Cards of the upgrade it can cut: the deck's it still plays, but its commanders. */
  outChoices: SearchChoice[]
  /** Cuts a copy of a card from the upgrade. */
  onCut: (name: string) => void
  /** Puts a card the upgrade cuts back in. */
  onKeep: (line: CardLine) => void
  /** Takes a card the upgrade adds back out. */
  onDrop: (line: CardLine) => void
  /** Adding a card to the upgrade, as on the list page. */
  adder: Adder
}

/**
 * An upgrade as what it changes in its deck: the deck's cards it cuts, and the cards it adds, side by
 * side but not paired, since the upgrade holds the whole deck as it will be rather than swaps;
 * each column in the list's order. Each card it adds says whether you own it, and the totals what is
 * left to buy.
 */
export function UpgradeSwapTable({ swaps, deckLabel, rows, outChoices, onCut, onKeep, onDrop, adder }: UpgradeSwapTableProps) {
  const { choices, pickCard, panel } = useCardAdder({ ...adder, onAdding: () => {} })
  const priced = usePricing(rows)
  const outs = swaps.outs.map((line) => priced(line, false)).sort(inListOrder)
  const ins = swaps.ins.map((line) => priced(line, true)).sort(inListOrder)
  /** Copies of a card in still to get: those of its line the inventory doesn't cover, at most its copies in. */
  const needOf = (card: Priced) => (card.row ? Math.min(card.line.qty, card.row.line.qty - card.row.owned) : card.line.qty)
  const toFinish = ins.reduce((sum, card) => sum + needOf(card) * (card.unit ?? 0), 0)
  const missing = ins.reduce((sum, card) => sum + needOf(card), 0)
  const changed = outs.length + ins.length > 0

  return (
    <section className="swaps upgrade-swaps" aria-labelledby="swaps-title">
      <div className="swaps-head">
        <h2 id="swaps-title">{ui.swaps.title}</h2>
        <span className="muted small">{ui.upgradeSwaps.changes(deckLabel)}</span>
        <span className="spacer" />
        <span className="muted small">{ui.swaps.counts(copiesOf(outs), copiesOf(ins))}</span>
      </div>

      {!changed && <p className="swaps-empty muted">{ui.upgradeSwaps.none(deckLabel)}</p>}

      <div className="swap-columns">
        <div className="swap-column" role="group" aria-label={ui.swaps.out}>
          <div className="swap-labels">
            <strong>{ui.swaps.out}</strong> {ui.upgradeSwaps.cutFrom(deckLabel)}
          </div>
          {outs.map((card) => (
            <div className="swap-item" key={card.line.id}>
              <SwapCard card={card} kind="out" />
              <UndoButton onClick={() => onKeep(card.line)} label={ui.upgradeSwaps.keep(card.line.name)} title={ui.upgradeSwaps.keepHint} />
            </div>
          ))}
          <div className="swap-item swap-add">
            <CardSearch id="swap-out-search" placeholder={ui.swaps.cut} choices={outChoices} onPick={onCut} />
          </div>
          {changed && (
            <div className="swap-sum">
              {ui.swaps.totalOut(copiesOf(outs))} <span className="swap-price">{formatEur(valueOf(outs))}</span>
            </div>
          )}
        </div>

        <SwapArrow />

        <div className="swap-column" role="group" aria-label={ui.swaps.in}>
          <div className="swap-labels">
            <strong className="swap-in">{ui.swaps.in}</strong> {ui.upgradeSwaps.added}
          </div>
          {ins.map((card) => {
            const need = needOf(card)
            return (
              <div className="swap-item" key={card.line.id}>
                <SwapCard
                  card={card}
                  kind="in"
                  note={
                    <span className={`swap-owned${need > 0 ? ' need' : ''}`}>
                      {need > 0 ? ui.upgradeSwaps.need(need) : ui.upgradeSwaps.owned}
                    </span>
                  }
                />
                <UndoButton onClick={() => onDrop(card.line)} label={ui.upgradeSwaps.drop(card.line.name)} title={ui.upgradeSwaps.dropHint} />
              </div>
            )
          })}
          <div className="swap-item swap-add">
            <CardSearch placeholder={choices ? ui.swaps.addFromInventory : ui.upgradeSwaps.add} choices={choices} onPick={pickCard} />
          </div>
          {changed && (
            <div className="swap-sum">
              {ui.swaps.totalIn(copiesOf(ins))} <span className="swap-price">{formatEur(valueOf(ins))}</span>
              <span className="swap-finish">
                {ui.upgradeSwaps.toFinish(missing)} <strong className="swap-price">{formatEur(toFinish)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>
      {panel && <div className="swap-panel">{panel}</div>}
    </section>
  )
}
