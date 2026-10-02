import { useState } from 'react'
import { CURVE_TOP, deckStats, STAT_COLORS, type DeckStats as Stats, type StatsRow } from '@shared/deckStats'
import { MANA_SYMBOLS } from '../lib/artwork'
import { cardCount } from '../lib/format'
import { Icon } from './Icon'

/** localStorage key of the panel's open state. */
const OPEN_KEY = 'mtg-dreams.statsOpen'
const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const

/** @returns Stored open state; true by default or if storage is unavailable. */
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Persists the open state; storage errors are ignored. */
function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {}
}

/** Collapsible stats panel: mana curve and color breakdown (see {@link deckStats}). */
export function DeckStats({ rows }: { rows: StatsRow[] }) {
  const [open, setOpen] = useState(readOpen)
  const stats = deckStats(rows)
  const toggle = () => {
    setOpen(!open)
    saveOpen(!open)
  }

  return (
    <section className={`deck-stats${open ? ' open' : ''}`}>
      <button type="button" className="deck-stats-toggle" aria-expanded={open} onClick={toggle}>
        <span className="deck-stats-chevron" aria-hidden="true">
          ›
        </span>
        Stats
        <span className="muted small">
          {`${counted(stats.spells, 'Card')} + ${counted(stats.lands, 'Land')}`}
          {stats.pending > 0 && ` · ${cardCount(stats.pending)} loading`}
        </span>
      </button>
      {open && stats.spells > 0 && (
        <div className="deck-stats-body">
          <ManaCurve stats={stats} />
          <ColorBreakdown stats={stats} />
        </div>
      )}
    </section>
  )
}

/** Mana curve bar chart, creatures and others stacked, in the accent color. */
function ManaCurve({ stats }: { stats: Stats }) {
  const tallest = Math.max(1, ...stats.curve.map((column) => column.creatures + column.others))
  const summary = stats.curve
    .map((column) => `${label(column.manaValue)}: ${column.creatures + column.others}`)
    .join(', ')
  return (
    <figure className="stats-chart">
      <figcaption>Mana curve</figcaption>
      <div className="curve" role="img" aria-label={`Cards by mana value. ${summary}`}>
        {stats.curve.map((column) => {
          const total = column.creatures + column.others
          return (
            <div key={column.manaValue} className="curve-slot" tabIndex={0} aria-label={tip(column.manaValue, column.creatures, column.others)}>
              <span className="curve-value">{total > 0 ? total : ''}</span>
              <div className="curve-bar" style={{ height: `${(total / tallest) * 100}%` }} />
              <span className="chart-tip" role="tooltip">
                Mana Value <ManaCost manaValue={column.manaValue} />: {counted(column.creatures + column.others, 'Card')}
              </span>
            </div>
          )
        })}
      </div>
      <div className="curve-axis" aria-hidden="true">
        {stats.curve.map((column) => (
          <span key={column.manaValue}>
            <ManaCost manaValue={column.manaValue} />
          </span>
        ))}
      </div>
      {stats.averageManaValue !== null && (
        <p className="curve-average">
          Average Mana Value: <strong>{stats.averageManaValue.toFixed(2)}</strong>
        </p>
      )}
    </figure>
  )
}

/** Curve column label; the last is `N+`. */
const label = (manaValue: number) => (manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(manaValue))

/** @returns Pluralized title-case count, e.g. `1 Card`. */
const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Curve bar tooltip. */
const tip = (manaValue: number, creatures: number, others: number) =>
  `Mana Value (${label(manaValue)}): ${counted(creatures + others, 'Card')}`

/** Per-color spell bars in each color, plus colorless and multicolor counts. */
function ColorBreakdown({ stats }: { stats: Stats }) {
  const bars = [
    ...STAT_COLORS.map((color) => ({ key: color, name: COLOR_NAMES[color], icon: MANA_SYMBOLS[color], count: stats.colors[color] })),
    { key: 'C', name: 'Colorless', icon: MANA_SYMBOLS.C, count: stats.colorless },
    { key: 'M', name: 'Multicolor', icon: null, count: stats.multicolor }
  ]
  return (
    <figure className="stats-chart">
      <figcaption>
        Color Distribution
        <span className="info-tip" tabIndex={0} aria-label="Multicolored cards count toward each of their colors">
          <Icon name="info" />
          <span className="chart-tip" role="tooltip">
            Multicolored cards count toward each of their colors
          </span>
        </span>
      </figcaption>
      <ul className="color-bars">
        {bars.map((bar) => (
          <li key={bar.key} className={bar.count === 0 ? 'is-zero' : undefined}>
            <span className="color-bar-name">
              {bar.icon ? <img src={bar.icon} alt="" draggable={false} /> : <span className="multicolor-dot" aria-hidden="true" />}
              {bar.name}
            </span>
            <span className="color-bar-track">
              <span className={`color-bar-fill bar-${bar.key}`} style={{ width: `${(bar.count / stats.spells) * 100}%` }} />
            </span>
            <span className="color-bar-count">{bar.count}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** Generic mana symbol for a curve column; the last shows `N+`. */
function ManaCost({ manaValue }: { manaValue: number }) {
  return (
    <span className="mana-cost">
      <ManaSymbol n={manaValue} />
      {manaValue === CURVE_TOP && '+'}
    </span>
  )
}

/** Inline SVG generic mana symbol (gray disc with number) in Scryfall's symbol colors. */
function ManaSymbol({ n }: { n: number }) {
  return (
    <svg className="mana-symbol" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#cac5c0" />
      <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fill="#0d0f0f">
        {n}
      </text>
    </svg>
  )
}
