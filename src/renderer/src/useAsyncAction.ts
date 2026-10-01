import { useState } from 'react'
import { cleanError } from './format'

/**
 * For buttons that start something slow (saving, importing, creating): `busy`
 * while it runs, and its error kept for display so the dialog can stay open.
 */
export function useAsyncAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run }
}
