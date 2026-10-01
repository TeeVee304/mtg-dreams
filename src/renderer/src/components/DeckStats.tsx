import { useState } from 'react'
import { CURVE_TOP, deckStats, STAT_COLORS, type DeckStats as Stats, type StatsRow } from '../../../shared/deckStats'
import { MANA_SYMBOLS } from '../artwork'
import { cardCount } from '../format'

// A collapsible panel under a list's value cards: its mana curve and colors. Both
// charts are one series in the theme's accent; labels, not colors, say what each bar is.

const OPEN_KEY = 'mtg-dreams.statsOpen'
const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const

/** Whether the panel was left open (it starts open). Storage can be unavailable. */
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

function saveOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, String(open))
  } catch {
    // Remembering is a convenience only.
  }
}

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
          {stats.spells > 0
            ? `${cardCount(stats.spells)} besides lands · average mana value ${stats.averageManaValue?.toFixed(2)}`
            : 'No cards besides lands yet'}
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
                {tip(column.manaValue, column.creatures, column.others)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="curve-axis" aria-hidden="true">
        {stats.curve.map((column) => (
          <span key={column.manaValue}>{label(column.manaValue)}</span>
        ))}
      </div>
    </figure>
  )
}

const label = (manaValue: number) => (manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(manaValue))

function tip(manaValue: number, creatures: number, others: number): string {
  const total = creatures + others
  if (total === 0) return `Mana value ${label(manaValue)}: no cards`
  const parts = [creatures && `${creatures} ${creatures === 1 ? 'creature' : 'creatures'}`, others && `${others} other ${others === 1 ? 'spell' : 'spells'}`]
  return `Mana value ${label(manaValue)}: ${cardCount(total)} (${parts.filter(Boolean).join(', ')})`
}

function ColorBreakdown({ stats }: { stats: Stats }) {
  const bars = [
    ...STAT_COLORS.map((color) => ({ key: color, name: COLOR_NAMES[color], icon: MANA_SYMBOLS[color], count: stats.colors[color] })),
    { key: 'C', name: 'Colorless', icon: MANA_SYMBOLS.C, count: stats.colorless },
    { key: 'M', name: 'Multicolor', icon: null, count: stats.multicolor }
  ]
  return (
    <figure className="stats-chart">
      <figcaption>
        Colors <span className="muted tiny">· multicolored cards count toward each of their colors</span>
      </figcaption>
      <ul className="color-bars">
        {bars.map((bar) => (
          <li key={bar.key} className={bar.count === 0 ? 'is-zero' : undefined}>
            <span className="color-bar-name">
              {bar.icon ? <img src={bar.icon} alt="" draggable={false} /> : <span className="multicolor-dot" aria-hidden="true" />}
              {bar.name}
            </span>
            <span className="color-bar-track">
              <span className="color-bar-fill" style={{ width: `${(bar.count / stats.spells) * 100}%` }} />
            </span>
            <span className="color-bar-count">{bar.count}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
