import { useMemo } from 'react'
import type { DeckPlanSummary } from '@shared/deckWizard/api'
import { isBasicLand } from '@shared/cards'
import type { DeckBrief } from '@shared/deckWizard/deckBrief'
import type { DeckPick } from '@shared/deckWizard/deckDraft'
import type { DeckReport } from '@shared/deckWizard/deckReport'
import type { BuiltDeck } from '@shared/deckWizard/deckSession'
import { SLOT_ROLES, slotInfo, type SlotId } from '@shared/deckWizard/deckTemplate'
import type { GlossaryEntry } from '@shared/deckWizard/glossary'
import { formatEur } from '../../lib/format'
import { previewHandlers } from '../../components/HoverPreview'
import { DeckReportPanel } from './DeckReport'
import { shortName } from '@shared/cards'
import { TermText, Tip } from './Term'

/**
 * The wizard's last two steps: the plan and the build (Build), and the deck to review, change and
 * save (Review).
 *
 * @packageDocumentation
 */

/** A build or change running, or just ended in an error. */
export interface Job {
  kind: 'build' | 'change'
  running: boolean
  error: string | null
}

/** Props of {@link BuildStep}. */
interface BuildStepProps {
  plan: DeckPlanSummary | null
  planError: string | null
  job: Job | null
  onBuild: () => void
  /** A deck was built before, maybe for other answers. */
  built: 'none' | 'current' | 'stale'
}

/** Step 5: the plan for the 99, then building it from the best cards for each part. */
export function BuildStep({ plan, planError, job, onBuild, built }: BuildStepProps) {
  const building = job?.kind === 'build' && job.running
  const failed = job?.kind === 'build' && !job.running ? job.error : null
  return (
    <div className="wizard-step">
      <section className="build-box">
        <h3>Build your deck</h3>
        {building ? (
          <p className="build-now" aria-live="polite">
            <span className="spinner" aria-hidden="true" /> Picking cards for every part of the plan…
          </p>
        ) : (
          <>
            <p className="step-intro">
              {built === 'current'
                ? 'Your deck is built. Building again replaces it, keeping the cards you locked.'
                : built === 'stale'
                  ? 'You changed your answers since the last build. Build again to match them.'
                  : 'MTG Dreams picks all 99 from the best cards for each part of the plan, within your bracket and budget, and says why each one is there. It takes a few seconds.'}
            </p>
            <button type="button" className="primary build-btn" disabled={!plan || building} onClick={onBuild}>
              {built === 'none' ? 'Build my deck' : 'Build again'}
            </button>
          </>
        )}
        {failed && <p className="warn">{failed}</p>}
      </section>

      <h3>The plan</h3>
      <p className="step-intro">
        MTG Dreams worked out the 99 cards’ jobs from your answers and your commander’s rules text. Each part gets cards
        that do the job and work with your commander.
      </p>
      {planError ? (
        <p className="warn">{planError}</p>
      ) : plan ? (
        <ul className="plan-slots">
          {plan.template.slots
            .filter((slot) => slot.count > 0)
            .map((slot) => (
              <li key={slot.id}>
                <span className="plan-count">{slot.count}</span>
                <span className="plan-text">
                  <span>
                    <Tip text={slot.explain} focusable>
                      <strong>{slot.label}</strong>
                    </Tip>
                    {slot.plain && <span className="muted small"> · {slot.plain}</span>}
                  </span>
                  <span className="muted small plan-why">{slot.why.join(' ')}</span>
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="muted">Reading every card that fits your brief…</p>
      )}

    </div>
  )
}

/** Order of slots in the review: ways to win, engines, the jobs, the theme, wildcards, then lands. */
function slotOrder(brief: DeckBrief): SlotId[] {
  const wincons = brief.wincons.map((wincon): SlotId => `wincon:${wincon}`)
  const engines = brief.engines.map((engine): SlotId => `engine:${engine}`)
  return [...wincons, ...engines, ...SLOT_ROLES, 'theme', 'wildcard', 'land']
}

/** Props of {@link ReviewStep}. */
interface ReviewStepProps {
  brief: DeckBrief
  deck: BuiltDeck
  /** The answers changed since the deck was built. */
  stale: boolean
  job: Job | null
  /** Notes from the latest change. */
  latestNotes: string[]
  /** The deck report, or why it isn't there yet. */
  report: { report: DeckReport | null; error: string | null }
  onRemove: (name: string) => void
  onSwap: (name: string) => void
  /** Locks a card into the deck, or unlocks it. */
  onLock: (name: string) => void
  /** Goes back to the Build step. */
  onRebuild: () => void
  /** Builds again at once, keeping the locked cards. */
  onRebuildNow: () => void
}

/** Step 6: the 99 by job, each with its price and reason, to lock, swap or remove. */
export function ReviewStep({ brief, deck, stale, job, latestNotes, report, onRemove, onSwap, onLock, onRebuild, onRebuildNow }: ReviewStepProps) {
  const busy = job?.running === true
  const groups = useMemo(() => {
    const order = slotOrder(brief)
    const bySlot = new Map<SlotId, DeckPick[]>()
    for (const pick of deck.picks) bySlot.set(pick.slot, [...(bySlot.get(pick.slot) ?? []), pick])
    return [...bySlot].sort(([a], [b]) => rank(order, a) - rank(order, b))
  }, [brief, deck.picks])
  const warningsFor = (name: string) => deck.check.issues.filter((i) => i.card === name && i.severity !== 'note').map((i) => i.message)
  const deckIssues = deck.check.issues.filter((i) => !i.card && i.severity !== 'note')
  const seen = new Set<GlossaryEntry>()

  return (
    <div className="wizard-step review-step">
      {stale && (
        <p className="stale-note">
          You changed your answers since this deck was built.{' '}
          <button type="button" className="link-btn" onClick={onRebuild} disabled={busy}>
            Build again
          </button>
        </p>
      )}
      {deck.summary && (
        <section className="review-summary">
          <h3>How this deck plays</h3>
          <p>
            <TermText text={deck.summary} seen={seen} />
          </p>
        </section>
      )}
      <BudgetBar total={deck.check.total} budget={brief.budget.total} />
      <DeckReportPanel report={report.report} error={report.error} commander={shortName(brief.commander)} />
      <p className="rebuild-row small">
        <span className="muted">
          {brief.locks.length > 0
            ? `${brief.locks.length === 1 ? '1 locked card stays' : `${brief.locks.length} locked cards stay`} when you rebuild.`
            : 'Lock the cards you want to keep; rebuilding keeps them and picks the rest again.'}
        </span>
        <button type="button" className="link-btn" disabled={busy} onClick={onRebuildNow}>
          Rebuild{brief.locks.length > 0 ? ', keeping locked cards' : ''}
        </button>
      </p>
      {(deck.notes.length > 0 || deckIssues.length > 0) && (
        <ul className="review-notes">
          {deck.notes.map((note) => (
            <li key={note} className={latestNotes.includes(note) ? 'latest' : undefined}>
              <TermText text={note} seen={seen} />
            </li>
          ))}
          {deckIssues.map((issue) => (
            <li key={issue.message} className={issue.severity === 'error' ? 'bad' : 'warn'}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {!busy && job?.kind === 'change' && job.error && <p className="warn small">{job.error}</p>}

      {groups.map(([slot, picks]) => {
        const info = slotInfo(slot)
        return (
          <section key={slot} className="review-group">
            <h4>
              <Tip text={`${info.plain ? `${info.plain}: ` : ''}${info.explain}`} focusable>
                {info.label}
              </Tip>{' '}
              <span className="muted small">· {picks.reduce((sum, p) => sum + p.qty, 0)}</span>
            </h4>
            <ul>
              {picks.map((pick) => {
                const basic = isBasicLand(pick.name)
                const price = deck.prices[pick.name]
                const anchor = brief.anchors.includes(pick.name)
                const locked = brief.locks.includes(pick.name)
                return (
                  <li key={pick.name} className={`review-card${locked ? ' locked' : ''}`}>
                    <span className="review-name" {...previewHandlers({ name: pick.name })}>
                      {pick.qty > 1 && <span className="review-qty">{pick.qty}</span>}
                      {locked && <span className="lock-mark" aria-label="Locked">🔒 </span>}
                      {pick.name}
                    </span>
                    <span className="review-price small">{price === null || price === undefined ? '—' : formatEur(price * pick.qty)}</span>
                    {!basic && !anchor && (
                      <span className="review-actions">
                        <button
                          type="button"
                          className="link-btn small"
                          disabled={busy}
                          aria-pressed={locked}
                          onClick={() => onLock(pick.name)}
                          title={locked ? 'Unlock it: rebuilding may replace it' : 'Lock it in: rebuilding keeps it'}
                        >
                          {locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button type="button" className="link-btn small" disabled={busy || locked} onClick={() => onSwap(pick.name)} title="Swap it for the next-best card for this job">
                          Swap
                        </button>
                        <button type="button" className="link-btn small" disabled={busy} onClick={() => onRemove(pick.name)} title="Take it out; a basic land takes its place">
                          Remove
                        </button>
                      </span>
                    )}
                    <p className="review-reason small">
                      <TermText text={pick.reason} seen={seen} />
                    </p>
                    {warningsFor(pick.name).map((warning) => (
                      <p key={warning} className="warn small review-warn">
                        ⚠ {warning}
                      </p>
                    ))}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** Position of a slot in the review order; unknown slots go before the lands. */
function rank(order: SlotId[], slot: SlotId): number {
  const at = order.indexOf(slot)
  return at >= 0 ? at : order.length - 1.5
}

/** The deck's cost against its budget. */
function BudgetBar({ total, budget }: { total: number; budget: number | null }) {
  if (budget === null) return <p className="budget-line">The deck costs {formatEur(total)}.</p>
  const share = Math.min(1, total / budget)
  return (
    <div className="budget-line">
      <span>
        {formatEur(total)} of your {formatEur(budget)} budget
      </span>
      <span className="budget-bar" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={total} aria-label="Deck cost against the budget">
        <span className={total > budget ? 'over' : undefined} style={{ width: `${share * 100}%` }} />
      </span>
    </div>
  )
}
