import { BRACKET_LEVELS, bracketName, type BracketLevel } from '@shared/brackets'
import { ui } from '@shared/text'

/** Props of {@link BracketPicker}. */
interface BracketPickerProps {
  value: BracketLevel | null
  onChange: (level: BracketLevel | null) => void
  /** `tiles` names each bracket under its number (the New list dialog); `compact` shows numbers only. */
  variant: 'tiles' | 'compact'
}

/** Picks the bracket a Deck plays at, or none: Not set, then 1 to 5. */
export function BracketPicker({ value, onChange, variant }: BracketPickerProps) {
  const options: (BracketLevel | null)[] = [null, ...BRACKET_LEVELS]
  return (
    <div className={`bracket-picker ${variant}`} role="group" aria-label={ui.bracket.declared}>
      {options.map((level) => (
        <button
          key={level ?? 'none'}
          type="button"
          className={level === null ? 'unset' : undefined}
          aria-pressed={value === level}
          title={level === null ? ui.bracket.notSet : ui.bracket.levelHint(level, bracketName(level))}
          onClick={() => onChange(level)}
        >
          <span className="bracket-picker-number">{level ?? (variant === 'tiles' ? '–' : ui.bracket.notSet)}</span>
          {variant === 'tiles' && <span className="bracket-picker-name">{level === null ? ui.bracket.notSet : bracketName(level)}</span>}
        </button>
      ))}
    </div>
  )
}
