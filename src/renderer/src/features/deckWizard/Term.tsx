import { useId, type ReactNode } from 'react'
import { findTerms, type GlossaryEntry } from '@shared/deckWizard/glossary'

/**
 * Words that explain themselves: jargon dotted-underlined, its meaning in a tooltip on hover or
 * keyboard focus.
 *
 * @packageDocumentation
 */

/** A term with its glossary meaning. */
export function Term({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  return (
    <Tip text={entry.meaning} focusable>
      {children}
    </Tip>
  )
}

/** Props of {@link Tip}. */
interface TipProps {
  /** The explanation shown on hover. */
  text: string
  children: ReactNode
  /**
   * Id of the tooltip, for a control around it to point `aria-describedby` at; inside a button or
   * another control, the control is what takes focus.
   */
  id?: string
  /** Takes keyboard focus itself; for tips outside any control. */
  focusable?: boolean
}

/** Text with an explanation shown on hover, and on focus of it or of the control around it. */
export function Tip({ text, children, id, focusable }: TipProps) {
  const own = useId()
  const tipId = id ?? own
  return (
    <span className="term" {...(focusable && { tabIndex: 0, 'aria-describedby': tipId })}>
      {children}
      <span id={tipId} role="tooltip" className="tip term-tip">
        {text}
      </span>
    </span>
  )
}

/**
 * Text with each glossary term explained the first time it appears.
 * @param seen - Terms explained earlier on the page, shared across texts so each is explained once.
 */
export function TermText({ text, seen }: { text: string; seen?: Set<GlossaryEntry> }) {
  return (
    <>
      {findTerms(text, seen).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <Term key={i} entry={part.entry}>
            {part.text}
          </Term>
        )
      )}
    </>
  )
}
