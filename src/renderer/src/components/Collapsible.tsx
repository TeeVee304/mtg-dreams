import type { ReactNode } from 'react'

/** Props of {@link Collapsible}. */
interface CollapsibleProps {
  open: boolean
  onToggle: () => void
  title: ReactNode
  /** Muted text beside the title, shown open or closed. */
  summary?: ReactNode
  /** Extra classes of the panel. */
  className?: string
  /** Panel body, rendered only while open. */
  children: ReactNode
}

/**
 * Panel folded to its title bar (Statistics, Tokens, Budget planner). The caller keeps the open
 * state, usually with {@link useStoredToggle}, so it can skip work while folded.
 */
export function Collapsible({ open, onToggle, title, summary, className, children }: CollapsibleProps) {
  return (
    <section className={`collapsible${className ? ` ${className}` : ''}${open ? ' open' : ''}`}>
      <button type="button" className="collapsible-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="collapsible-chevron" aria-hidden="true">
          ›
        </span>
        {title}
        {summary !== undefined && <span className="muted small">{summary}</span>}
      </button>
      {open && children}
    </section>
  )
}
