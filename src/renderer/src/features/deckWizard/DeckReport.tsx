import type { ReactNode } from 'react'
import { BRACKETS } from '@shared/deckWizard/deckBrief'
import { CURVE_TOP, GOOD_CHANCE, type DeckReport } from '@shared/deckWizard/deckReport'
import { glossaryEntry } from '@shared/deckWizard/glossary'
import { Tip } from './Term'

/**
 * The deck report at the top of the review: power level, mana curve, color odds, jobs, staples and
 * solo games, each heading explained on hover, so the numbers teach what makes a deck work.
 *
 * @packageDocumentation
 */

/** Color names, for screen readers and tooltips. */
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

/** "87%". */
const percent = (share: number) => `${Math.round(share * 100)}%`

/** A heading that explains itself with a glossary meaning, or the text given. */
function Heading({ term, text, children }: { term?: string; text?: string; children: ReactNode }) {
  const meaning = text ?? (term && glossaryEntry(term)?.meaning)
  return <h4>{meaning ? <Tip text={meaning} focusable>{children}</Tip> : children}</h4>
}

/** Props of {@link DeckReportPanel}. */
interface DeckReportPanelProps {
  report: DeckReport | null
  error: string | null
  commander: string
}

/** The report, or why it isn't there yet. */
export function DeckReportPanel({ report, error, commander }: DeckReportPanelProps) {
  if (error) return <p className="warn small">{error}</p>
  if (!report) {
    return (
      <p className="muted small">
        <span className="spinner" aria-hidden="true" /> Checking the deck…
      </p>
    )
  }
  const { power, goldfish } = report
  const tallest = Math.max(1, ...report.curve)
  return (
    <section className="deck-report" aria-label="Deck report">
      <div className="report-card">
        <Heading term="bracket">Power level</Heading>
        <p className={power.issues.length > 0 ? 'warn' : undefined}>
          Plays like <strong>Bracket {power.estimate} · {BRACKETS[power.estimate].label}</strong>
          {power.estimate !== power.target && <span className="muted"> (you asked for Bracket {power.target})</span>}
        </p>
        {power.issues.map((issue) => (
          <p key={issue} className="warn small">
            {issue}
          </p>
        ))}
        {power.issues.length === 0 && power.reasons.map((reason) => <p key={reason} className="muted small">{reason}</p>)}
        <p className="small">
          <Tip text={glossaryEntry('game changer')!.meaning} focusable>
            Game Changers
          </Tip>
          : {power.gameChangers.length > 0 ? power.gameChangers.join(', ') : 'none'}
        </p>
        <p className="small">
          <Tip text={glossaryEntry('combo')!.meaning} focusable>
            Combos
          </Tip>
          : {power.combos.length === 0 ? 'none found' : ''}
        </p>
        {power.combos.length > 0 && (
          <ul className="report-combos small">
            {power.combos.map((combo) => (
              <li key={combo.id}>
                <Tip text={combo.steps || combo.results.join(', ')}>
                  <span>{combo.cards.join(' + ')}</span>
                </Tip>
                <span className="muted">: {combo.results.slice(0, 2).join(', ').toLowerCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="report-card">
        <Heading term="mana curve">Mana curve</Heading>
        <div className="report-curve" role="img" aria-label={`Spells by mana value: ${report.curve.map((n, mv) => `${n} at ${mv}${mv === CURVE_TOP ? '+' : ''}`).join(', ')}`}>
          {report.curve.map((count, manaValue) => (
            <div key={manaValue} className="curve-col">
              <span className="curve-count small">{count || ''}</span>
              <span className="curve-bar" style={{ height: `${(count / tallest) * 100}%` }} />
              <span className="curve-mv tiny">
                {manaValue}
                {manaValue === CURVE_TOP ? '+' : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="small muted">
          Average{' '}
          <Tip text={glossaryEntry('mana value')!.meaning} focusable>
            mana value
          </Tip>{' '}
          {report.averageManaValue.toFixed(2)} · {report.lands} lands
        </p>
      </div>

      <div className="report-card">
        <Heading term="color sources">Colors</Heading>
        {report.colors.map((odds) => (
          <p key={odds.color} className={`small${odds.chance < GOOD_CHANCE ? ' warn' : ''}`}>
            <span className={`pip pip-${odds.color.toLowerCase()}`} aria-label={COLOR_NAMES[odds.color]} title={COLOR_NAMES[odds.color]} />{' '}
            {odds.sources} sources ·{' '}
            <Tip text={`Chance of having ${odds.hardest.pips} ${COLOR_NAMES[odds.color].toLowerCase()} sources by turn ${odds.hardest.turn}, to cast ${odds.hardest.name} on curve. ${percent(GOOD_CHANCE)} or more is good.`}>
              <span>
                {percent(odds.chance)} for {odds.hardest.name}
              </span>
            </Tip>
          </p>
        ))}
      </div>

      <div className="report-card">
        <Heading text="How many cards do each job; a card doing two jobs counts for both.">Jobs</Heading>
        <ul className="report-jobs small">
          {report.jobs.map((job) => (
            <li key={job.role} className={job.count < job.target ? 'warn' : undefined}>
              <Tip text={`${job.plain ? `${job.plain}: ` : ''}${job.explain}`}>
                <span>{job.label}</span>
              </Tip>
              <span>
                {job.count} / {job.target}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {report.staples && report.staples.cards.length > 0 && (
        <div className="report-card">
          <Heading text={`${glossaryEntry('staple')!.meaning} The share of the ${report.staples.decks} official precons that could play each card that do.`}>
            Staples
          </Heading>
          <ul className="report-jobs report-staples small">
            {report.staples.cards.map((staple) => (
              <li key={staple.name} className={staple.inDeck ? undefined : 'muted'}>
                {staple.why ? (
                  <Tip text={staple.why}>
                    <span>{staple.name}</span>
                  </Tip>
                ) : (
                  <span>{staple.name}</span>
                )}
                <span>
                  {staple.inDeck ? '✓ ' : ''}
                  {percent(staple.rate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="report-card">
        <Heading term="goldfish">Solo games</Heading>
        <p className="small">
          A land every turn through turn 4: <strong>{percent(goldfish.landDrops)}</strong> of games
        </p>
        <p className="small">
          {commander} on turn {goldfish.commanderTurn}: <strong>{percent(goldfish.commanderOnCurve)}</strong> of games
        </p>
      </div>
    </section>
  )
}
