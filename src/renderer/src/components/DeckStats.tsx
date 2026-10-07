import { COLOR_NAMES } from '@shared/cards'
import { CURVE_TOP, deckStats, STAT_COLORS, type DeckStats as Stats, type StatsRow } from '@shared/deckStats'
import { MANA_SYMBOLS } from '../lib/artwork'
import { cardCount } from '../lib/format'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { Collapsible } from './Collapsible'
import { Icon } from './Icon'

/** localStorage key of the panel's open state. */
const OPEN_KEY = 'mtg-dreams.statsOpen'

/** Props of {@link DeckStats}. */
interface DeckStatsProps {
  /** Main deck rows. */
  rows: StatsRow[]
  /** Curve column the list is filtered to; null for none. */
  manaValue: number | null
  /** Filters the list to a curve column; null clears it. */
  onManaValue: (manaValue: number | null) => void
}

/**
 * Collapsible stats panel of decks and wishlists (deck plans), closed by default with the card and
 * land counts: mana curve and color breakdown (see {@link deckStats}). A curve bar filters the list
 * to its mana value.
 */
export function DeckStats({ rows, manaValue, onManaValue }: DeckStatsProps) {
  const [open, toggle] = useStoredToggle(OPEN_KEY, false)
  const stats = deckStats(rows)

  return (
    <Collapsible
      open={open}
      onToggle={toggle}
      title={
        <span className="nav-icon-name">
          Statistics <Icon name="chart" />
        </span>
      }
      summary={
        <>
          {`${counted(stats.spells, 'card')} + ${counted(stats.lands, 'land')}`}
          {stats.pending > 0 && ` · ${cardCount(stats.pending)} loading`}
        </>
      }
    >
      {stats.spells > 0 && (
        <div className="deck-stats-body">
          <ManaCurve stats={stats} selected={manaValue} onSelect={onManaValue} />
          <ColorBreakdown stats={stats} />
        </div>
      )}
    </Collapsible>
  )
}

/**
 * Mana curve bar chart: creatures at the bottom of each bar, other spells stacked above in a lighter
 * shade. A bar is a toggle that filters the list to its mana value.
 */
function ManaCurve({ stats, selected, onSelect }: { stats: Stats; selected: number | null; onSelect: (manaValue: number | null) => void }) {
  const tallest = Math.max(1, ...stats.curve.map((column) => column.creatures + column.others))
  return (
    <figure className="stats-chart">
      <figcaption className="curve-caption">
        Mana curve
        <span className="curve-legend" aria-hidden="true">
          <span className="curve-key creatures" /> Creatures
          <span className="curve-key others" /> Other spells
        </span>
      </figcaption>
      <div className={`curve${selected !== null ? ' filtering' : ''}`} role="group" aria-label="Filter the list by mana value">
        {stats.curve.map((column) => {
          const total = column.creatures + column.others
          const on = selected === column.manaValue
          return (
            <button
              key={column.manaValue}
              type="button"
              className={`curve-slot${on ? ' on' : ''}`}
              aria-pressed={on}
              aria-label={tip(column.manaValue, column.creatures, column.others)}
              disabled={total === 0 && !on}
              onClick={() => onSelect(on ? null : column.manaValue)}
            >
              <span className="curve-value">{total > 0 ? total : ''}</span>
              <span className="curve-bar" style={{ height: `${(total / tallest) * 100}%` }}>
                {column.others > 0 && <span className="curve-part others" style={{ flexGrow: column.others }} />}
                {column.creatures > 0 && <span className="curve-part creatures" style={{ flexGrow: column.creatures }} />}
              </span>
              <span className="tip" role="tooltip">
                Mana Value <ManaCost manaValue={column.manaValue} />
                <br />
                <span className="muted">{on ? 'Click to show every card' : 'Click to show'}</span>
              </span>
            </button>
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
          Average mana value: <strong>{stats.averageManaValue.toFixed(2)}</strong>
        </p>
      )}
    </figure>
  )
}

/** Curve column label; the last is `N+`. */
const label = (manaValue: number) => (manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(manaValue))

/** @returns Pluralized count, e.g. `1 card`. */
const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Curve bar accessible name. */
const tip = (manaValue: number, creatures: number, others: number) =>
  `Mana value (${label(manaValue)}): ${counted(creatures + others, 'card')}, ${counted(creatures, 'creature')}`

/** Per-color spell bars in each color, plus colorless and multicolor counts; colors with no cards are left out. */
function ColorBreakdown({ stats }: { stats: Stats }) {
  const bars = [
    ...STAT_COLORS.map((color) => ({ key: color, name: COLOR_NAMES[color], icon: MANA_SYMBOLS[color], count: stats.colors[color] })),
    { key: 'C', name: COLOR_NAMES.C, icon: MANA_SYMBOLS.C, count: stats.colorless },
    { key: 'M', name: 'Multicolor', icon: null, count: stats.multicolor }
  ].filter((bar) => bar.count > 0)
  return (
    <figure className="stats-chart">
      <figcaption>
        Color distribution
        <span className="info-tip" tabIndex={0} aria-label="Multicolored cards count toward each of their colors">
          <Icon name="info" />
          <span className="tip" role="tooltip">
            Multicolored cards count toward each of their colors
          </span>
        </span>
      </figcaption>
      <ul className="color-bars">
        {bars.map((bar) => (
          <li key={bar.key}>
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
