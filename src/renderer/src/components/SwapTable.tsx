import type { ComponentProps } from 'react'
import type { SwapPair, Variant } from '@shared/listVersion'
import type { CardLine, Printing } from '@shared/types'
import { cardCount, formatEur } from '../lib/format'
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
  adder: Omit<ComponentProps<typeof ListAddCards>, 'onAddPrecon' | 'onAdding'>
}

/** A side of a pair: a card, priced. */
interface Priced {
  line: CardLine
  unit: number | null
  images: Printing | null
}

/**
 * A version as what it changes (Out → In): each card it cuts beside the card it plays
 * instead, in order. Picking a card out and a card in adds a pair, filling an uneven last one first;
 * each pair is undone at once.
 */
export function SwapTable({ pairs, variant, baseLabel, rows, outChoices, onCut, onUndo, adder }: SwapTableProps) {
  const { priceBasis, bundleBasics } = useSettings()
  const { choices, pickCard, panel } = useCardAdder({ ...adder, onAdding: () => {} })

  const priced = (line: CardLine | null, own: boolean): Priced | null => {
    if (!line) return null
    const row = own ? rows.find((other) => other.line.id === line.id) : undefined
    if (row) return { line, unit: row.unit, images: row.resolution?.printing ?? null }
    const cheapest = cheapestVersion(line.name, priceBasis)
    return { line, unit: cheapest?.unit ?? null, images: cheapest?.printing ?? null }
  }
  const sides = pairs.map((pair) => ({ out: priced(pair.out, false), in: priced(pair.in, true) }))
  const total = (side: 'out' | 'in') =>
    sides.reduce((sum, pair) => sum + (pair[side] ? (pair[side].unit ?? 0) * pair[side].line.qty : 0), 0)
  const copies = (side: 'out' | 'in') => sides.reduce((sum, pair) => sum + (pair[side]?.line.qty ?? 0), 0)
  const outValue = total('out')
  const inValue = total('in')
  const difference = inValue - outValue

  const card = (side: Priced | null, kind: 'out' | 'in') =>
    side ? (
      <div className={`swap-card ${kind}`} {...previewHandlers({ src: side.images?.imageNormal, back: side.images?.imageBack, name: side.line.name })}>
        <CardThumb src={side.images?.imageSmall} />
        <span className="swap-card-name">
          <strong>
            {side.line.qty > 1 && <span className="swap-qty">{side.line.qty}× </span>}
            {side.line.name}
          </strong>
          <span className="muted small">{getCardInfo(side.line.name, bundleBasics)?.typeLine}</span>
        </span>
        <span className="swap-price">{side.unit === null ? '—' : formatEur(side.unit * side.line.qty)}</span>
      </div>
    ) : (
      <div className={`swap-card ${kind} empty-side`}>{kind === 'out' ? 'Nothing cut' : 'Nothing instead'}</div>
    )

  return (
    <section className="swaps" aria-labelledby="swaps-title">
      <div className="swaps-head">
        <h2 id="swaps-title">Swaps</h2>
        <span className="muted small">
          What the {variant.label} version changes from the {baseLabel} version
        </span>
        <span className="spacer" />
        <span className="muted small">
          {copies('out')} out · {copies('in')} in
        </span>
      </div>

      <div className="swap-grid swap-labels">
        <span>
          <strong>Out</strong> Cut from the {baseLabel} version
        </span>
        <span />
        <span>
          <strong className="swap-in">In</strong> Only in the {variant.label} version
        </span>
        <span />
      </div>

      {sides.length === 0 && (
        <p className="swaps-empty muted">
          No swaps yet: the {variant.label} version plays the same cards. Cut a card and add another instead below.
        </p>
      )}

      {sides.map((pair, index) => (
        <div className="swap-grid swap-row" key={`${pair.out?.line.id ?? '-'} ${pair.in?.line.id ?? '-'}`}>
          {card(pair.out, 'out')}
          <span className="swap-arrow" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          {card(pair.in, 'in')}
          <button
            type="button"
            className="icon-btn swap-undo"
            onClick={() => onUndo(index)}
            aria-label={`Undo the swap of ${[pair.out?.line.name, pair.in?.line.name].filter(Boolean).join(' for ')}`}
            title="Undo this swap"
          >
            <Icon name="close" />
          </button>
        </div>
      ))}

      <div className="swap-grid swap-add">
        <CardSearch id="swap-out-search" placeholder="Cut a card from the deck…" choices={outChoices} onPick={onCut} />
        <span className="swap-arrow" aria-hidden="true">
          <Icon name="arrow" />
        </span>
        <CardSearch
          placeholder={choices ? 'Add a card from your inventory…  (Ctrl+K)' : 'Add a card instead…  (Ctrl+K)'}
          choices={choices}
          onPick={pickCard}
        />
        <span />
      </div>
      {panel && <div className="swap-panel">{panel}</div>}

      {sides.length > 0 && (
        <div className="swap-grid swap-totals">
          <span>
            {cardCount(copies('out'))} out <span className="swap-price">{formatEur(outValue)}</span>
          </span>
          <span />
          <span>
            {cardCount(copies('in'))} in{' '}
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
