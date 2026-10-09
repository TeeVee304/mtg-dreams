import { useEffect } from 'react'
import { CARD_SEARCH_ID } from '../components/CardSearch'

/** Input types that do not take text (and have no native undo). */
const NOT_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'])

/** @returns Whether `target` is a text field (native Ctrl+Z applies). */
export function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return !NOT_TEXT_INPUTS.has(target.type)
  return target instanceof HTMLElement && target.isContentEditable
}

/** The app's keyboard shortcuts: Ctrl+K focuses card search; Ctrl+Z calls `onUndo` outside text fields. */
export function useShortcuts(onUndo: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        document.getElementById(CARD_SEARCH_ID)?.focus()
      } else if (key === 'z' && !event.shiftKey && !isTyping(event.target)) {
        event.preventDefault()
        onUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onUndo])
}
