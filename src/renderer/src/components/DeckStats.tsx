import { Fragment, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { COLOR_NAMES } from '@shared/cards'
import { CURVE_TOP, deckStats, STAT_COLORS, type CurveCard, type CurveColumn, type DeckStats as Stats, type StatsRow } from '@shared/deckStats'
import { manaBase, type ManaBase, type Table } from '@shared/manaBase'
import { nameKey } from '@shared/decklist'
import { ui } from '@shared/text'
import { sumOf } from '@shared/totals'
import { useResizeObserver } from '../hooks/useResizeObserver'
import { MANA_SYMBOLS } from '../lib/artwork'
import { Collapsible } from './Collapsible'

/** Props of {@link DeckStats}. */
interface DeckStatsProps {
  /** Open; the page keeps it, so opening the Bracket section can fold it. */
  open: boolean
  onToggle: () => void
  /** Main deck rows, the Companion aside. */
  rows: Array<StatsRow & { line: { name: string; qty: number } }>
  /** The commanders, who start in the command zone: they are cast, but never drawn. */
  leaders: string[]
  /** The format's size and players, for draw odds and the suggested Lands; null for no format. */
  table: Table | null
  /** Shows the energy curve (the list's own setting). */
  energy: boolean
  /** Curve column the list is filtered to; null for none. */
  manaValue: number | null
  /** Filters the list to a curve column; null clears it. */
  onManaValue: (manaValue: number | null) => void
}

/**
 * Collapsible stats panel of decks and wishlists (deck plans), closed by default with the average
 * mana value. On the left, the mana curve, one dot a Card in the colors its cost asks for, with the
 * chance of being on curve under each mana value, and, when the list turns it on, the energy each
 * mana value makes and spends. Beside it, the mana base: Lands, ramp, and each color's sources against
 * its target. A curve column filters the list to its mana value.
 */
export function DeckStats({ open, onToggle: toggle, rows, leaders, table, energy, manaValue, onManaValue }: DeckStatsProps) {
  const stats = deckStats(rows)
  const leaderKeys = leaders.map(nameKey)
  const base = open
    ? manaBase(
        rows.map((row) => ({ ...row, leader: leaderKeys.includes(nameKey(row.line.name)) })),
        table,
        stats.averageManaValue
      )
    : null
  const stretch = usePlotStretch(open && stats.spells > 0 && !!base)

  return (
    <Collapsible
      open={open}
      onToggle={toggle}
      className="stats-panel"
      title={
        <span className="nav-icon-name stats-title">
          <MiniCurve stats={stats} />
          <span className="stats-title-name">{ui.stats.title}</span>
        </span>
      }
      summary={
        <>
          {stats.averageManaValue !== null ? (
            <>
              {ui.stats.average} <b>{stats.averageManaValue.toFixed(2)}</b>
            </>
          ) : (
            ui.count.lands(stats.lands)
          )}
          {stats.pending > 0 && ui.stats.loading(stats.pending)}
        </>
      }
    >
      {stats.spells > 0 && base && (
        <div className="deck-stats-body">
          <ManaCurve stats={stats} base={base} energy={energy} stretch={stretch.px} curveRef={stretch.curve} selected={manaValue} onSelect={onManaValue} />
          <ManaBaseSide base={base} sideRef={stretch.side} />
        </div>
      )}
    </Collapsible>
  )
}

/**
 * How much taller the curve's plot grows so the curve ends where the mana base beside it does: a
 * mana base of many colors runs past the curve's own height. None when the mana base sits under it.
 * The dots keep their size; only the plot, its lines and its tide grow.
 */
function usePlotStretch(shown: boolean): { curve: RefObject<HTMLDivElement | null>; side: RefObject<HTMLElement | null>; px: number } {
  const curve = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLElement>(null)
  const [px, setPx] = useState(0)
  const measure = () => {
    const plot = curve.current?.getBoundingClientRect()
    const base = side.current?.getBoundingClientRect()
    if (!plot || !base) return
    setPx((current) => {
      if (base.top >= plot.bottom - 2) return 0
      // The curve's height without the stretch it has now, against the mana base's.
      const next = Math.max(0, Math.round(base.height - (plot.height - current)))
      return Math.abs(next - current) > 1 ? next : current
    })
  }
  useLayoutEffect(() => {
    if (shown) measure()
  }, [shown])
  useResizeObserver(shown, () => [curve.current, side.current], measure)
  return { curve, side, px }
}

/** Curve column label; the last is `N+`. */
const label = (manaValue: number) => (manaValue === CURVE_TOP ? `${CURVE_TOP}+` : String(manaValue))

/** @returns A column's spells. */
const totalOf = (column: CurveColumn) => column.creatures + column.others

/** A chance as a whole percentage. */
const percent = (chance: number) => Math.round(chance * 100)

/** Fill of a Card's dot: its color; a multicolor Card's colors, as slices of a pie. Generic only is a ring, in CSS. */
function dotFill(card: CurveCard): string | undefined {
  if (card.kind === 'generic') return undefined
  if (card.kind === 'C') return 'var(--stat-colorless)'
  const colors = card.colors.map((color) => `var(--mana-${color.toLowerCase()})`)
  if (colors.length === 1) return colors[0]
  const stops = colors.map((color, i) => `${color} ${(i / colors.length) * 360}deg ${((i + 1) / colors.length) * 360}deg`)
  return `conic-gradient(${stops.join(', ')})`
}

/**
 * Height of the curve's plot, in px, that the dots and the land lines share; the room above its 100%,
 * clear of the counts; and the room under its 0%, the columns' bottom padding.
 */
interface Plot {
  height: number
  top: number
  bottom: number
  /** Highest the dots stack, in px, before they shrink. */
  dots: number
}

/** The plot alone, and shorter by the energy rows' height when they show, so the panel keeps its height. */
const PLOT: Plot = { height: 260, top: 16, bottom: 4, dots: 224 }
const PLOT_WITH_ENERGY: Plot = { height: 170, top: 16, bottom: 4, dots: 134 }

/** Width of a curve column, in px, unless its dots need more; and the most it grows to, given the room. */
const COLUMN = { min: 60, max: 112 }

/** A column's count over its dots: its height, the room under it, and the room it keeps from a line's point, in px. */
const COUNT = { height: 18, gap: 6, clear: 8 }

/** Room between a land line's last point and its name, in px. */
const NAME_GAP = 18

/** Largest dot, in px; then 3 abreast when 2 would be smaller than `minDot`; never under `smallestDot`. */
const CURVE = { dot: 22, minDot: 12, smallestDot: 8 }

/** Dot size, gap and count abreast that fit the tallest column, of `tallest` Cards, in the plot's `height` for dots. */
function dotLayout(tallest: number, height: number): { dot: number; gap: number; abreast: number } {
  const fit = (abreast: number) => {
    const rows = Math.max(1, Math.ceil(tallest / abreast))
    const gap = 4
    return Math.floor((height + gap) / rows - gap)
  }
  const abreast = fit(2) >= CURVE.minDot ? 2 : 3
  const dot = Math.max(CURVE.smallestDot, Math.min(CURVE.dot, fit(abreast)))
  return { dot, gap: dot >= 16 ? 4 : 3, abreast }
}

/** The land lines' points: one a mana value from 1, with its column's place in the curve. */
function linePoints(columns: CurveColumn[]) {
  return columns.flatMap((column, index) => (column.manaValue > 0 ? [{ index, turn: column.manaValue }] : []))
}

/** A column's center, as a share of the plot's width, 0 to 100. */
const centerOf = (index: number, columns: number) => ((index + 0.5) / columns) * 100

/** A chance's height in the plot, in px from its top: 100% under the counts, 0% on the columns' floor. */
const heightOf = (chance: number, plot: Plot) => plot.top + (1 - chance) * (plot.height - plot.top - plot.bottom)

/** Props of the land lines' layers. */
interface LandLinesProps {
  columns: CurveColumn[]
  base: ManaBase
  plot: Plot
}

/**
 * How far to lift a column's count, in px (0 or less), so a Lands point never lands on it: over the
 * point, when the point would cover it.
 */
function countLift(cards: number, layout: { dot: number; gap: number; abreast: number }, point: number | null, plot: Plot): number {
  if (point === null || cards === 0) return 0
  const rows = Math.ceil(cards / layout.abreast)
  const bottom = plot.height - plot.bottom - (rows * layout.dot + (rows - 1) * layout.gap) - COUNT.gap
  const top = bottom - COUNT.height
  if (point < top - COUNT.clear || point > bottom + COUNT.clear) return 0
  return Math.min(0, point - COUNT.clear - bottom)
}

/**
 * The tide under the Lands line: a faint fill, behind the dots, so the chance of being on curve reads
 * as a level the curve stands in, held flat out to the plot's edges. The plot stretches across, so it
 * is drawn in shares of its width.
 */
function OnCurveTide({ columns, base, plot }: LandLinesProps) {
  // React's ids hold characters a url() reference can trip on.
  const id = `tide${useId().replace(/[^\w-]/g, '')}`
  const points = linePoints(columns)
  if (points.length < 2) return null
  const x = (index: number) => centerOf(index, columns.length)
  const first = heightOf(base.onTime[points[0].turn - 1], plot)
  const last = heightOf(base.onTime[points[points.length - 1].turn - 1], plot)
  const floor = plot.height - plot.bottom
  const edge = points.map(({ index, turn }) => `L${x(index)},${heightOf(base.onTime[turn - 1], plot)}`).join(' ')
  return (
    <svg className="stats-tide" viewBox={`0 0 100 ${plot.height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" />
          <stop offset="1" />
        </linearGradient>
      </defs>
      <path d={`M0,${floor} L0,${first} ${edge} L100,${last} L100,${floor} Z`} fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * The chance of being on curve at each mana value, drawn over the dots on the plot's own 0 to 100%
 * height: Lands alone, solid, on a halo that keeps it clear of the dots; Lands and cheap ramp, dashed,
 * when there is cheap ramp. Each line is named at its end; the values sit in the On curve row.
 */
function OnCurveLines({ columns, base, plot }: LandLinesProps) {
  const text = ui.stats
  const points = linePoints(columns)
  const last = points[points.length - 1]
  if (!last) return null
  const x = (index: number) => centerOf(index, columns.length)
  const path = (chances: number[]) => points.map(({ index, turn }, i) => `${i === 0 ? 'M' : 'L'}${x(index)},${heightOf(chances[turn - 1], plot)}`).join(' ')
  const withRamp = base.ramp.cheap > 0
  // The names at the lines' ends, kept a line apart: the ramp line is never below the Lands one.
  const landsEnd = heightOf(base.onTime[last.turn - 1], plot)
  const rampEnd = Math.min(heightOf(base.onTimeRamp[last.turn - 1], plot), landsEnd - 16)
  const at = (index: number, top: number): CSSProperties => ({ left: `${x(index)}%`, top })
  return (
    <div className="stats-lines" aria-hidden="true">
      <svg viewBox={`0 0 100 ${plot.height}`} preserveAspectRatio="none">
        {withRamp && <path className="halo" d={path(base.onTimeRamp)} vectorEffect="non-scaling-stroke" />}
        {withRamp && <path className="ramp" d={path(base.onTimeRamp)} vectorEffect="non-scaling-stroke" />}
        <path className="halo" d={path(base.onTime)} vectorEffect="non-scaling-stroke" />
        <path className="lands" d={path(base.onTime)} vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map(({ index, turn }) => (
        <i key={turn} className="stats-point" style={at(index, heightOf(base.onTime[turn - 1], plot))} />
      ))}
      <span className="stats-line-name" style={{ ...at(last.index, landsEnd), marginLeft: NAME_GAP }}>
        {text.landsLine}
      </span>
      {withRamp && (
        <span className="stats-line-name" style={{ ...at(last.index, rampEnd), marginLeft: NAME_GAP }}>
          {text.rampLine}
        </span>
      )}
    </div>
  )
}

/** Height of each half of an energy column, in px: made above its line, spent below. */
const ENERGY_HALF = 26

/** Props of {@link ManaCurve}. */
interface ManaCurveProps {
  stats: Stats
  base: ManaBase
  /** Shows the energy rows. */
  energy: boolean
  selected: number | null
  onSelect: (manaValue: number | null) => void
  /** Px the plot grows, to end with the mana base beside it. */
  stretch: number
  /** The curve's element, which {@link usePlotStretch} measures. */
  curveRef: RefObject<HTMLDivElement | null>
}

/**
 * Mana curve: a column of dots per mana value, one a Card, colors first, then multicolor, then generic
 * only, bottom up, with the {@link OnCurveLines} over them on the plot's 0 to 100% height. Under it,
 * the mana values and the chance of being on curve at each; with `energy`, the energy each mana value
 * makes and spends. A column is a toggle filtering the list; hovering it details its spells.
 */
function ManaCurve({ stats, base, energy, stretch, curveRef, selected, onSelect }: ManaCurveProps) {
  const text = ui.stats
  const [hovered, setHovered] = useState<{ column: CurveColumn; left: number } | null>(null)
  // Mana value 0 only when a spell costs nothing.
  const columns = stats.curve.filter((column) => column.manaValue > 0 || totalOf(column) > 0 || selected === 0)
  const toggle = (manaValue: number) => onSelect(selected === manaValue ? null : manaValue)
  const show = (event: { currentTarget: HTMLElement }, column: CurveColumn) => {
    const el = event.currentTarget
    setHovered({ column, left: el.offsetLeft + el.offsetWidth + 6 })
  }
  const made = sumOf(stats.curve, (column) => column.energy.made)
  const spent = sumOf(stats.curve, (column) => column.energy.spent)
  const energyMax = Math.max(1, ...stats.curve.map((column) => Math.max(column.energy.made, column.energy.spent)))
  const plain = energy ? PLOT_WITH_ENERGY : PLOT
  // Taller to meet the mana base's bottom; the dots keep the room they had.
  const plot = { ...plain, height: plain.height + stretch }
  const layout = dotLayout(Math.max(0, ...columns.map(totalOf)), plot.dots)
  const { dot, gap, abreast } = layout
  // A column is never narrower than its dots, with room either side; it widens into spare room.
  const width = Math.max(COLUMN.min, dot * abreast + gap * (abreast - 1) + 12)
  // The lines' names hang past the last column's center: the curve keeps just that room on its right,
  // measured again as the columns widen or narrow.
  const [overhang, setOverhang] = useState(0)
  // The widest name: its overhang at the narrowest columns sets the least width, whatever the columns'
  // width now. Measured from the live overhang, the least width would shrink as the columns widen, and a
  // curve that just wrapped under the figures could fit again, unwrap, narrow and wrap, flickering.
  const [names, setNames] = useState(0)
  // The row labels' width: with the narrowest columns and the overhang, the least the curve needs.
  const [labels, setLabels] = useState(0)
  const withRamp = base.ramp.cheap > 0
  const measure = () => {
    const curve = curveRef.current
    const plot = curve?.querySelector('.stats-lines')?.getBoundingClientRect().right
    if (!curve || plot === undefined) return
    const ends = [...curve.querySelectorAll('.stats-line-name')].map((span) => span.getBoundingClientRect().right)
    setOverhang(Math.max(0, Math.ceil(Math.max(plot, ...ends) - plot)))
    setNames(Math.ceil(Math.max(0, ...[...curve.querySelectorAll('.stats-line-name')].map((span) => span.getBoundingClientRect().width))))
    setLabels(Math.ceil(Math.max(0, ...[...curve.querySelectorAll('.stats-label')].map((label) => label.getBoundingClientRect().width))))
  }
  useLayoutEffect(measure, [withRamp, columns.length])
  useResizeObserver(true, () => [curveRef.current], measure, [withRamp, columns.length])

  return (
    <div
      ref={curveRef}
      className="stats-curve"
      style={
        {
          gridTemplateColumns: `max-content repeat(${columns.length}, minmax(${width}px, ${Math.max(width, COLUMN.max)}px))`,
          paddingRight: overhang,
          // Its least width, from the narrowest columns: a grid's min-content would take the widest.
          minWidth: labels + columns.length * width + Math.max(0, Math.ceil(names + NAME_GAP - width / 2)),
          '--stats-dot': `${dot}px`,
          '--stats-gap': `${gap}px`,
          '--stats-abreast': abreast,
          '--stats-plot': `${plot.height}px`
        } as CSSProperties
      }
    >
      <span className="stats-plot-start" />
      <OnCurveTide columns={columns} base={base} plot={plot} />
      {columns.map((column, index) => {
        const total = totalOf(column)
        const on = selected === column.manaValue
        const point = column.manaValue > 0 ? heightOf(base.onTime[column.manaValue - 1], plot) : null
        const lift = countLift(total, layout, point, plot)
        return (
          <button
            key={column.manaValue}
            type="button"
            className={`stats-column${on ? ' on' : ''}${selected !== null && !on ? ' faded' : ''}`}
            style={{ gridColumn: index + 2 }}
            aria-pressed={on}
            aria-label={text.bar(label(column.manaValue), total)}
            disabled={total === 0 && !on}
            onClick={() => toggle(column.manaValue)}
            onMouseEnter={(event) => show(event, column)}
            onFocus={(event) => show(event, column)}
            onMouseLeave={() => setHovered(null)}
            onBlur={() => setHovered(null)}
          >
            {total > 0 && (
              <span className="stats-total" style={lift < 0 ? { transform: `translateY(${lift}px)` } : undefined}>
                {total}
              </span>
            )}
            <span className="stats-dots">
              {column.cards.map((card, i) => (
                <i key={i} className={card.kind === 'generic' ? 'generic' : undefined} style={{ background: dotFill(card) }} />
              ))}
            </span>
          </button>
        )
      })}
      <OnCurveLines columns={columns} base={base} plot={plot} />
      {hovered && <CurveTip column={hovered.column} left={hovered.left} on={selected === hovered.column.manaValue} />}

      <span className="stats-label stats-rule">{text.manaValueRow}</span>
      {columns.map((column) => (
        <span key={column.manaValue} className="stats-mv stats-rule">
          {label(column.manaValue)}
        </span>
      ))}
      <span className="stats-label">{text.onCurve}</span>
      {columns.map((column) => {
        const turn = column.manaValue
        const lands = turn > 0 ? percent(base.onTime[turn - 1]) : null
        return (
          <span
            key={turn}
            className={`stats-chance${selected === turn ? ' on' : ''}`}
            title={lands !== null ? text.onCurveHint(turn, lands, percent(base.onTimeRamp[turn - 1])) : undefined}
          >
            {lands !== null && `${lands}%`}
          </span>
        )
      })}

      {energy && (
        <>
          <span className="stats-label stats-energy-label stats-rule">
            <span>
              {text.energy}
              <br />
              {text.energyMade} <b>{made}</b>
              <br />
              {text.energySpent} <b>{spent}</b>
            </span>
          </span>
          {columns.map((column) => {
            const { made: up, spent: down } = column.energy
            return (
              <span key={column.manaValue} className="stats-energy stats-rule" title={up || down ? text.energyOf(up, down) : undefined}>
                <span className="up">
                  {up > 0 && <small>{up}</small>}
                  {up > 0 && <i style={{ height: (up / energyMax) * ENERGY_HALF }} />}
                </span>
                <span className="down">
                  {down > 0 && <i style={{ height: (down / energyMax) * ENERGY_HALF }} />}
                  {down > 0 && <small>{down}</small>}
                </span>
              </span>
            )
          })}
        </>
      )}
    </div>
  )
}

/** Details of a curve column, on hover or focus: its spells, creatures and colored pips. */
function CurveTip({ column, left, on }: { column: CurveColumn; left: number; on: boolean }) {
  const pips = STAT_COLORS.filter((color) => column.pips[color] > 0)
  return (
    <div className="stats-tip" role="tooltip" style={{ left }}>
      <h4>{ui.stats.manaValue(label(column.manaValue))}</h4>
      <dl>
        <dt>{ui.stats.spells}</dt>
        <dd>{totalOf(column)}</dd>
        <dt>{ui.stats.creatures}</dt>
        <dd>{column.creatures}</dd>
        {pips.length > 0 && (
          <>
            <dt>{ui.stats.pips}</dt>
            <dd className="stats-tip-pips">
              {pips.map((color) => (
                <span key={color}>
                  <img src={MANA_SYMBOLS[color]} alt={COLOR_NAMES[color]} draggable={false} />
                  {column.pips[color]}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <p className="muted">{on ? ui.stats.showEvery : ui.stats.show}</p>
    </div>
  )
}

/** The mana base beside the curve, in cards: Lands and the suggested count, ramp by kind, and each color's sources against its target. */
function ManaBaseSide({ base, sideRef }: { base: ManaBase; sideRef: RefObject<HTMLElement | null> }) {
  const text = ui.stats
  const scale = Math.max(1, ...base.colors.map((need) => Math.max(need.sources, need.target))) * 1.1
  const { ramp } = base
  return (
    <aside className="stats-side" ref={sideRef}>
      <div className="stats-cards">
        <section className="stats-card">
          <h4>{text.lands}</h4>
          <p className="stats-figure">
            {base.lands}
            {base.suggestedLands !== null && base.formula && (
              <small title={text.suggestedHint(base.formula.deckSize, base.formula.base, base.formula.perManaValue)}>
                {text.suggested(base.suggestedLands)}
              </small>
            )}
          </p>
        </section>
        <section className="stats-card">
          <h4>{text.ramp}</h4>
          <p className="stats-figure">
            {ramp.total}
            {ramp.total > 0 && <small>{text.cheapRamp(ramp.cheap)}</small>}
          </p>
          <dl className="stats-ramp">
            <dt>{text.rocks}</dt>
            <dd>{ramp.rocks}</dd>
            <dt>{text.manaCreatures}</dt>
            <dd>{ramp.creatures}</dd>
            <dt>{text.searches}</dt>
            <dd>{ramp.searches}</dd>
          </dl>
        </section>
        {base.colors.length > 0 && (
          <section className="stats-card stats-colors">
            <h4>{text.sources}</h4>
            <div className="stats-sources">
              {base.colors.map((need) => {
                const hint = text.targetHint(need.target, need.card, need.turn)
                return (
                  <Fragment key={need.color}>
                    <img src={MANA_SYMBOLS[need.color]} alt={COLOR_NAMES[need.color]} draggable={false} />
                    <span className="stats-meter" title={hint}>
                      <i style={{ width: `${(need.sources / scale) * 100}%`, background: `var(--mana-${need.color.toLowerCase()})` }} />
                      <b style={{ left: `${(need.target / scale) * 100}%` }} />
                    </span>
                    <span className="stats-count" title={hint}>
                      {need.sources} <span>/ {need.target}</span>
                    </span>
                  </Fragment>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}

/** The mana curve in miniature, on the panel's button. */
function MiniCurve({ stats }: { stats: Stats }) {
  const totals = stats.curve.map(totalOf)
  const tallest = Math.max(1, ...totals)
  return (
    <span className="mini-curve" aria-hidden="true">
      {totals.map((total, index) => (
        <span key={index} className={total === 0 ? 'mini-curve-gap' : undefined} style={{ height: `${Math.max(1, (total / tallest) * 22)}px` }} />
      ))}
    </span>
  )
}
