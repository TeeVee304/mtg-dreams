import { useId, useRef, type KeyboardEvent } from 'react'
import { Tip } from './Term'

/** An answer: what players call it, the same in plain words, and what it means. */
export interface ChoiceOption<T extends string> {
  id: T
  /** What players call it: "Aggro". */
  label: string
  /** The same in plain words, shown under the label. */
  plain?: string
  /** What it means, shown on hover or focus. */
  explain: string
  /** Why it suits the player's cards; marks it as suggested. */
  why?: string
}

/** Props of {@link ChoiceGroup}. */
interface ChoiceGroupProps<T extends string> {
  /** Accessible name of the group. */
  label: string
  options: ReadonlyArray<ChoiceOption<T>>
  /** Chosen answers, in order of choice. */
  selected: readonly T[]
  onToggle: (id: T) => void
  /** One answer only, chosen by click or arrow keys (a radio group); else buttons that toggle. */
  single?: boolean
  /** Label on a chosen answer, e.g. Main or Second. */
  badge?: (id: T, index: number) => string | null
}

/**
 * Answer cards: the community name, explained on hover or focus, with the same in plain words
 * underneath and, for suggested answers, why it suits the player's cards. Arrow keys move between
 * answers; in a single-answer group they also choose.
 */
export function ChoiceGroup<T extends string>({ label, options, selected, onToggle, single, badge }: ChoiceGroupProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const base = useId()
  const current = Math.max(0, options.findIndex((o) => selected.includes(o.id)))

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    refs.current[next]?.focus()
    if (single) onToggle(options[next].id)
  }

  return (
    <div className="choices" role={single ? 'radiogroup' : 'group'} aria-label={label}>
      {options.map((option, index) => {
        const at = selected.indexOf(option.id)
        const on = at >= 0
        const tag = on && badge ? badge(option.id, at) : null
        const tipId = `${base}-${index}`
        return (
          <button
            key={option.id}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role={single ? 'radio' : undefined}
            aria-checked={single ? on : undefined}
            aria-pressed={single ? undefined : on}
            aria-describedby={tipId}
            tabIndex={single && index !== current ? -1 : 0}
            className={`choice${on ? ' selected' : ''}${option.why ? ' suggested' : ''}`}
            onClick={() => onToggle(option.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="choice-head">
              <Tip id={tipId} text={option.explain}>
                <span className="choice-label">{option.label}</span>
              </Tip>
              {tag && <span className="choice-badge">{tag}</span>}
            </span>
            {option.plain && <span className="choice-plain">{option.plain}</span>}
            {option.why && <span className="choice-why">✦ {option.why}</span>}
          </button>
        )
      })}
    </div>
  )
}
