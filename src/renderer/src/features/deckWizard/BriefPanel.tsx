import { useId } from 'react'
import type { DeckBrief } from '@shared/deckWizard/deckBrief'
import { briefLines, STEPS, type StepId } from './model'
import { Tip } from './Term'

/** Props of {@link BriefPanel}. */
interface BriefPanelProps {
  brief: DeckBrief
  /** Goes to the step that sets a line; absent while the step can't be reached. */
  onGo: (step: StepId) => void
  canGo: (step: StepId) => boolean
}

/**
 * The deck brief, always in view: every answer in the words players use, explained on hover. The
 * deck is built to it, so it can't drift; clicking a line goes back to the step that sets it.
 */
export function BriefPanel({ brief, onGo, canGo }: BriefPanelProps) {
  const base = useId()
  return (
    <aside className="brief-panel" aria-label="Deck brief">
      <h3>Deck brief</h3>
      <p className="muted tiny">What your deck is built to. Click a line to change it.</p>
      <ul>
        {briefLines(brief).map((line, i) => {
          const tipId = `${base}-${i}`
          return (
            <li key={line.label}>
              <button
                type="button"
                className={`brief-line${line.empty ? ' unset' : ''}`}
                disabled={!canGo(line.step)}
                aria-label={`${line.label}: ${line.value}. Change on the ${STEPS.find((s) => s.id === line.step)!.label} step`}
                {...(line.tip && { 'aria-describedby': tipId })}
                onClick={() => onGo(line.step)}
              >
                <span className="brief-label">{line.label}</span>
                {line.tip ? (
                  <Tip id={tipId} text={line.tip}>
                    <span className="brief-value">{line.value}</span>
                  </Tip>
                ) : (
                  <span className="brief-value">{line.value}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

/** Props of {@link StepRail}. */
interface StepRailProps {
  current: StepId
  onGo: (step: StepId) => void
  canGo: (step: StepId) => boolean
}

/** The steps across the top, the current one marked; reachable ones can be clicked. */
export function StepRail({ current, onGo, canGo }: StepRailProps) {
  const at = STEPS.findIndex((s) => s.id === current)
  return (
    <ol className="step-rail" aria-label="Steps">
      {STEPS.map((step, index) => (
        <li key={step.id} className={index < at ? 'done' : index === at ? 'current' : undefined}>
          <button type="button" aria-current={index === at ? 'step' : undefined} disabled={!canGo(step.id)} onClick={() => onGo(step.id)}>
            <span className="step-number" aria-hidden="true">
              {index + 1}
            </span>
            {step.label}
          </button>
        </li>
      ))}
    </ol>
  )
}
