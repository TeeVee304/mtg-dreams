import { useEffect, useState } from 'react'

/** Props of {@link Stepper}. */
interface StepperProps {
  value: number
  onChange: (value: number) => void
  /** Accessible label. */
  label: string
  min?: number
  max?: number
  /** Tooltip on `+` at the maximum. */
  maxTitle?: string
}

/** Numeric input with −/+ buttons bounded by `min`/`max`; a value already above `max` may be kept but not raised. */
export function Stepper({ value, onChange, label, min = 0, max = 9999, maxTitle }: StepperProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const n = Number.parseInt(draft, 10)
    const valid = Number.isFinite(n) && n >= min
    const next = valid ? Math.min(n, Math.max(max, value)) : value
    if (next !== value) onChange(next)
    setDraft(String(next))
  }

  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        −
      </button>
      <input
        value={draft}
        inputMode="numeric"
        aria-label={label}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        title={value >= max ? maxTitle : undefined}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </span>
  )
}
