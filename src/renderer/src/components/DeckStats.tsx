import { COLOR_NAMES } from '@shared/cards'
import { CURVE_TOP, deckStats, STAT_COLORS, type DeckStats as Stats, type StatsRow } from '@shared/deckStats'
import { ui } from '@shared/text'
import { MANA_SYMBOLS } from '../lib/artwork'
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
 * Collapsible stats panel of decks and wishlists (deck plans), closed by default with the average
 * mana value (the card and land counts are beside it already): mana curve and color breakdown (see {@link deckStats}). A curve bar filters the list
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
          <MiniCurve stats={stats} />
          {ui.stats.title}
        </span>
      }
      summary={
        <>
          {stats.averageManaValue !== null ? ui.stats.average(stats.averageManaValue.toFixed(2)) : ui.count.lands(stats.lands)}
          {stats.pending > 0 && ui.stats.loading(stats.pending)}
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
        {ui.stats.curve}
        <span className="curve-legend" aria-hidden="true">
          <span className="curve-key creatures" /> {ui.stats.creatures}
          <span className="curve-key others" /> {ui.stats.otherSpells}
        </span>
      </figcaption>
      <div className={`curve${selected !== null ? ' filtering' : ''}`} role="group" aria-label={ui.stats.filterHint}>
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
                {ui.stats.manaValue} <ManaCost manaValue={column.manaValue} />
                <br />
                <span className="muted">{on ? ui.stats.showEvery : ui.stats.show}</span>
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
          {ui.stats.averageLabel} <strong>{stats.averageManaValue.toFixed(2)}</strong>
        </p>
      )}
    </figure>
  )
}

/** The mana curve in miniature, on the panel's button. */
function MiniCurve({ stats }: { stats: Stats }) {
  const totals = stats.curve.map((column) => column.creatures + column.others)
  const tallest = Math.max(1, ...totals)
  return (
    <span className="mini-curve" aria-hidden="true">
      {totals.map((total, index) => (
        <span key={index} className={total === 0 ? 'mini-curve-gap' : undefined} style={{ height: `${Math.max(1, (total / tallest) * 22)}px` }} />
      ))}
    </span>
  )
}

/** Curve column label; the last is `N+`. */
const label = (manaValue: number) => (manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(manaValue))

/** Curve bar accessible name. */
const tip = (manaValue: number, creatures: number, others: number) => ui.stats.bar(label(manaValue), creatures + others, creatures)

/** Per-color spell bars in each color, plus colorless and multicolor counts; colors with no cards are left out. */
function ColorBreakdown({ stats }: { stats: Stats }) {
  const bars = [
    ...STAT_COLORS.map((color) => ({ key: color, name: COLOR_NAMES[color], icon: MANA_SYMBOLS[color], count: stats.colors[color] })),
    { key: 'C', name: COLOR_NAMES.C, icon: MANA_SYMBOLS.C, count: stats.colorless },
    { key: 'M', name: ui.stats.multicolor, icon: null, count: stats.multicolor }
  ].filter((bar) => bar.count > 0)
  return (
    <figure className="stats-chart">
      <figcaption>
        {ui.stats.colors}
        <span className="info-tip" tabIndex={0} aria-label={ui.stats.multicolorHint}>
          <Icon name="info" />
          <span className="tip" role="tooltip">
            {ui.stats.multicolorHint}
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
