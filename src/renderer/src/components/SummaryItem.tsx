import type { ReactNode } from 'react'

/** Props of {@link SummaryItem}. */
interface SummaryItemProps {
  label: string
  value: string
  /** The page's headline figure, in the accent color. */
  accent?: boolean
  /** Colors the value as a warning. */
  warn?: boolean
  /** Muted text beside the value. */
  note?: string
  /** Control after the note, e.g. a details link. */
  action?: ReactNode
  /** Shown below the value (a progress bar). */
  children?: ReactNode
}

/** One labeled figure of a `.summary-strip`. */
export function SummaryItem({ label, value, accent, warn, note, action, children }: SummaryItemProps) {
  return (
    <div className={`summary-item${accent ? ' accent' : ''}`}>
      <span className="summary-label">{label}</span>
      <span className="summary-line">
        <span className={`summary-value${warn ? ' warn' : ''}`}>{value}</span>
        {note && <span className="summary-note">{note}</span>}
        {action}
      </span>
      {children}
    </div>
  )
}
