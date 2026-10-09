import { useCallback, useEffect, useState } from 'react'
import type { DeckHelperStatus, DeckPlanSummary } from '@shared/deckWizard/api'
import type { DeckBrief } from '@shared/deckWizard/deckBrief'
import type { DeckReport } from '@shared/deckWizard/deckReport'
import { wishlistText } from '@shared/deckWizard/deckWishlist'
import { shortName } from '@shared/cards'
import { preconListName } from '@shared/precons'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { cleanError } from '../../lib/format'
import { Modal } from '../../components/Modal'
import { BriefPanel, StepRail } from './BriefPanel'
import { BuildStep, ReviewStep, type Job } from './BuildSteps'
import { CommanderStep, type FocusState } from './CommanderStep'
import { briefKey, clearDraft, loadDraft, newDraft, saveDraft, STEPS, type StepId, type WizardDraft } from './model'
import { IdeaStep, PowerStep, TuneStep, type IdeasState } from './QuestionSteps'
import { WizardHat } from './WizardHat'
import './wizard.css'

/** Props of {@link DeckWizard}. */
interface DeckWizardProps {
  onClose: () => void
  /** Creates the wishlist; errors show in the wizard. */
  onCreate: (name: string, text: string, cards: number) => Promise<void>
  /** Names of the existing wishlists, for a default name that's free. */
  wishlistNames: string[]
}

/** How often to check on the card library while it downloads. */
const POLL_MS = 1000
/** Wait after the last change to the answers before planning again. */
const PLAN_DEBOUNCE_MS = 500

/**
 * The Deck Wizard: a popup that asks any player, from new to expert, about the Commander deck they
 * want, in the words players use and each explained on hover. It keeps their answers in a deck
 * brief always in view, builds the 99 to it, and saves the result as a wishlist. Every question has a default, so Quick build works from
 * the second step on. Answers and the built deck are saved as a draft, so closing loses nothing.
 */
export function DeckWizard({ onClose, onCreate, wishlistNames }: DeckWizardProps) {
  const [resume, setResume] = useState<WizardDraft | null>(loadDraft)
  const [draft, setDraft] = useState<WizardDraft>(() => resume ?? newDraft())
  const [status, setStatus] = useState<DeckHelperStatus | null>(null)
  const [focus, setFocus] = useState<FocusState>({ info: null, error: null, loading: false })
  const [plan, setPlan] = useState<{ key: string; summary: DeckPlanSummary | null; error: string | null } | null>(null)
  const [ideas, setIdeas] = useState<IdeasState & { key: string }>({ key: '', list: null, error: null })
  const [report, setReport] = useState<{ key: string; report: DeckReport | null; error: string | null }>({ key: '', report: null, error: null })
  const [job, setJob] = useState<Job | null>(null)
  const [latestNotes, setLatestNotes] = useState<string[]>([])
  /** Cards swapped out of this deck, so swapping again doesn't bring them back. */
  const [swappedOut, setSwappedOut] = useState<string[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const create = useAsyncAction()
  const { brief, step, deck } = draft
  const running = job?.running === true

  useEffect(() => {
    if (!resume) saveDraft(draft)
  }, [draft, resume])

  const update = useCallback((patch: Partial<DeckBrief>) => setDraft((d) => ({ ...d, brief: { ...d.brief, ...patch } })), [])
  const go = (next: StepId) => setDraft((d) => ({ ...d, step: next }))

  // The card library and the precons download the first time, while the player answers.
  const refreshStatus = useCallback(() => window.deckWizard.getStatus().then(setStatus, () => undefined), [])
  useEffect(() => {
    void window.deckWizard.prepare().then(setStatus, () => undefined)
  }, [])
  const ready = status?.library.state === 'ready'
  useEffect(() => {
    if (!status || (ready && !status.precons.loading) || status.error) return
    const timer = setTimeout(refreshStatus, POLL_MS)
    return () => clearTimeout(timer)
  }, [status, ready, refreshStatus])

  // What the commander and key cards do.
  const anchorsKey = brief.anchors.join('\n')
  useEffect(() => {
    if (!brief.commander || !ready) return
    let current = true
    setFocus((f) => ({ ...f, loading: true, error: null }))
    window.deckWizard.getFocus(brief.commander, brief.anchors, brief.budget.basis).then(
      (info) => current && setFocus({ info, error: null, loading: false }),
      (e) => current && setFocus({ info: null, error: cleanError(e), loading: false })
    )
    return () => {
      current = false
    }
    // `anchorsKey` stands for the key cards.
  }, [brief.commander, anchorsKey, brief.budget.basis, ready])

  // The plan, for counting the cards that fit the budget and showing what the deck needs.
  const key = briefKey(brief)
  const wantsPlan = step === 'power' || step === 'build'
  useEffect(() => {
    if (!wantsPlan || !ready || !brief.commander || plan?.key === key) return
    let current = true
    const timer = setTimeout(() => {
      window.deckWizard.plan(brief).then(
        (summary) => current && setPlan({ key, summary, error: null }),
        (e) => current && setPlan({ key, summary: null, error: cleanError(e) })
      )
    }, PLAN_DEBOUNCE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [wantsPlan, ready, brief, key, plan?.key])

  // Deck ideas: they depend on the cards the deck may play, so on the bracket and budget too.
  // The precons add an idea once they're in.
  const ideasKey = JSON.stringify([brief.commander, brief.anchors, brief.bracket, brief.budget, status?.precons.decks ?? 0])
  useEffect(() => {
    if (step !== 'idea' || !ready || !brief.commander || ideas.key === ideasKey) return
    // Until the answer arrives, the ideas shown are for another key, so the step shows them loading.
    let current = true
    window.deckWizard.getIdeas(brief).then(
      (list) => current && setIdeas({ key: ideasKey, list, error: null }),
      (e) => current && setIdeas({ key: ideasKey, list: null, error: cleanError(e) })
    )
    return () => {
      current = false
    }
    // `ideasKey` stands for what the ideas depend on.
  }, [step, ready, ideasKey, ideas.key])

  // The report on the built deck.
  const reportKey = deck ? JSON.stringify([brief.bracket, deck.picks.map((p) => [p.name, p.qty])]) : ''
  useEffect(() => {
    if (step !== 'review' || !deck || report.key === reportKey) return
    let current = true
    window.deckWizard.getReport(brief, { picks: deck.picks, summary: deck.summary }).then(
      (r) => current && setReport({ key: reportKey, report: r, error: null }),
      (e) => current && setReport({ key: reportKey, report: null, error: cleanError(e) })
    )
    return () => {
      current = false
    }
    // `reportKey` stands for the deck and bracket.
  }, [step, reportKey, report.key])

  /** Runs a build or change, keeping its error for the step to show. */
  const runJob = async (kind: Job['kind'], work: () => Promise<void>) => {
    setJob({ kind, running: true, error: null })
    try {
      await work()
      setJob(null)
    } catch (e) {
      setJob({ kind, running: false, error: cleanError(e) })
    }
  }

  const build = (forBrief: DeckBrief = brief) =>
    runJob('build', async () => {
      const built = await window.deckWizard.build(forBrief)
      setLatestNotes([])
      setSwappedOut([])
      setDraft((d) => ({ ...d, deck: built, builtFrom: briefKey(forBrief), step: 'review' }))
    })

  /** Builds with the best deck idea, unless the player chose one or their own, and every other default. */
  const quickBuild = () => {
    setDraft((d) => ({ ...d, step: 'build' }))
    void runJob('build', async () => {
      let next = brief
      const chosen = brief.ideaId !== null || brief.strategy !== null || brief.wincons.length > 0 || brief.engines.length > 0
      if (!chosen) {
        const list = ideas.key === ideasKey && ideas.list ? ideas.list : await window.deckWizard.getIdeas(brief)
        const idea = list[0]
        if (idea) next = { ...brief, ideaId: idea.id, strategy: idea.strategy, wincons: idea.wincons, engines: idea.engines }
      }
      setDraft((d) => ({ ...d, brief: next }))
      const built = await window.deckWizard.build(next)
      setLatestNotes([])
      setSwappedOut([])
      setDraft((d) => ({ ...d, deck: built, builtFrom: briefKey(next), step: 'review' }))
    })
  }

  const remove = (name: string) => {
    if (!deck) return
    void runJob('change', async () => {
      const edit = await window.deckWizard.edit(brief, { picks: deck.picks, summary: deck.summary }, [name], [])
      setDraft((d) => (d.deck ? { ...d, deck: { ...d.deck, ...edit } } : d))
    })
  }

  const swap = (name: string) => {
    if (!deck) return
    void runJob('change', async () => {
      const edit = await window.deckWizard.swap(brief, { picks: deck.picks, summary: deck.summary }, name, swappedOut)
      setSwappedOut((out) => [...out, name])
      setDraft((d) => (d.deck ? { ...d, deck: { ...d.deck, ...edit } } : d))
    })
  }

  const index = STEPS.findIndex((s) => s.id === step)
  const canGo = (target: StepId) => {
    if (running) return target === step
    if (target === 'commander') return true
    if (target === 'review') return deck !== null
    return !!brief.commander && !focus.error
  }
  const next = STEPS[index + 1]
  /** Steps after which every answer left has a default. */
  const quickSteps: StepId[] = ['power', 'idea', 'tune']
  const back = STEPS[index - 1]
  const stale = deck !== null && draft.builtFrom !== key
  const defaultName = brief.commander ? preconListName(`${shortName(brief.commander)} deck plan`, wishlistNames) : ''
  const name = draft.name || defaultName

  const libraryNote =
    status?.error ? (
      <p className="warn small">
        {status.error}{' '}
        <button type="button" className="link-btn" onClick={() => void window.deckWizard.prepare().then(setStatus)}>
          Try again
        </button>
      </p>
    ) : status && !ready ? (
      <p className="muted small library-note" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Getting every card’s rules text and price
        {status.library.state === 'downloading' && status.library.progress !== null && ` (${Math.round(status.library.progress * 100)}%)`}. This
        happens once and takes a minute.
      </p>
    ) : status?.precons.loading && status.precons.decks === 0 ? (
      <p className="muted small library-note" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Reading the official precons, to see what decks built by people play. This
        happens once; until then, decks are built from the cards alone.
      </p>
    ) : status && !status.precons.loading && status.precons.failed > 0 ? (
      <p className="muted small library-note">
        {status.precons.failed === 1 ? '1 official precon' : `${status.precons.failed} official precons`} couldn’t be downloaded; decks are
        built from the {status.precons.decks} that could. MTG Dreams tries again next time.
      </p>
    ) : null

  const footer = resume ? undefined : step === 'review' && deck ? (
    <>
      <ResetButton confirm={confirmReset} setConfirm={setConfirmReset} disabled={running} onReset={() => setDraft(newDraft())} />
      <span className="spacer" />
      {create.error && <span className="warn small">{create.error}</span>}
      <label className="field-inline wishlist-name">
        Wishlist name
        <input value={name} onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))} />
      </label>
      <button
        type="button"
        className="primary"
        disabled={running || create.busy || !name.trim()}
        onClick={() =>
          void create.run(async () => {
            await onCreate(name.trim(), wishlistText(brief, deck), deck.picks.reduce((sum, p) => sum + p.qty, 1))
            clearDraft()
          })
        }
      >
        Create wishlist
      </button>
    </>
  ) : (
    <>
      <ResetButton confirm={confirmReset} setConfirm={setConfirmReset} disabled={running || (!brief.commander && !deck)} onReset={() => setDraft(newDraft())} />
      <span className="spacer" />
      {back && (
        <button type="button" disabled={!canGo(back.id)} onClick={() => go(back.id)}>
          Back
        </button>
      )}
      {quickSteps.includes(step) && (
        <button
          type="button"
          className="quick-build"
          disabled={running || !ready || !brief.commander || !!focus.error}
          title="Build now with the best deck idea and default answers; you can change anything afterwards"
          onClick={quickBuild}
        >
          Quick build
        </button>
      )}
      {next && (
        <button type="button" className="primary" disabled={!canGo(next.id)} onClick={() => go(next.id)}>
          {next.id === 'review' ? 'Review the deck' : `Next: ${next.label}`}
        </button>
      )}
    </>
  )

  return (
    <Modal title="Deck Wizard" icon={<WizardHat size={24} />} size="wizard" dismissable={false} onClose={onClose} footer={footer}>
      {resume ? (
        <div className="wizard-resume">
          <WizardHat size={48} />
          <h3>Continue your {shortName(resume.brief.commander)} deck?</h3>
          <p className="muted">
            Your answers{resume.deck ? ' and your deck' : ''} are saved from last time.
          </p>
          <div className="foot-row">
            <button type="button" className="primary" autoFocus onClick={() => setResume(null)}>
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(newDraft())
                setResume(null)
              }}
            >
              Start over
            </button>
          </div>
        </div>
      ) : (
        <div className="wizard">
          <StepRail current={step} onGo={go} canGo={canGo} />
          <div className="wizard-main">
            <div className="wizard-content" key={step}>
              {libraryNote}
              {step === 'commander' && (
                <CommanderStep brief={brief} update={update} focus={focus} unavailable={ready ? undefined : 'Getting the card library ready…'} />
              )}
              {step === 'power' && (
                <PowerStep brief={brief} update={update} plan={plan?.summary ?? null} planError={plan?.key === key ? plan.error : null} />
              )}
              {step === 'idea' && (
                <IdeaStep
                  brief={brief}
                  update={update}
                  ideas={ideas.key === ideasKey ? ideas : { list: null, error: null }}
                  wincons={focus.info?.wincons ?? null}
                  engines={focus.info?.engines ?? null}
                />
              )}
              {step === 'tune' && <TuneStep brief={brief} update={update} />}
              {step === 'build' && (
                <BuildStep
                  plan={plan?.key === key ? plan.summary : null}
                  planError={plan?.key === key ? plan.error : null}
                  job={job}
                  onBuild={() => void build()}
                  built={deck === null ? 'none' : stale ? 'stale' : 'current'}
                />
              )}
              {step === 'review' && deck && (
                <ReviewStep
                  brief={brief}
                  deck={deck}
                  stale={stale}
                  job={job}
                  latestNotes={latestNotes}
                  report={report.key === reportKey ? report : { report: null, error: null }}
                  onRemove={remove}
                  onSwap={swap}
                  onLock={(name) => update({ locks: brief.locks.includes(name) ? brief.locks.filter((n) => n !== name) : [...brief.locks, name] })}
                  onRebuildNow={() => void build()}
                  onRebuild={() => go('build')}
                />
              )}
            </div>
            <BriefPanel brief={brief} onGo={go} canGo={canGo} />
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Props of {@link ResetButton}. */
interface ResetButtonProps {
  confirm: boolean
  setConfirm: (confirm: boolean) => void
  disabled: boolean
  onReset: () => void
}

/** Starts the wizard over; asks once more first, as everything is lost. */
function ResetButton({ confirm, setConfirm, disabled, onReset }: ResetButtonProps) {
  useEffect(() => {
    if (!confirm) return
    const timer = setTimeout(() => setConfirm(false), 4000)
    return () => clearTimeout(timer)
  }, [confirm, setConfirm])
  return (
    <button
      type="button"
      className={confirm ? 'danger' : 'link-btn small'}
      disabled={disabled}
      onClick={() => {
        if (!confirm) return setConfirm(true)
        setConfirm(false)
        onReset()
      }}
    >
      {confirm ? 'Click again to start over' : 'Start over'}
    </button>
  )
}

