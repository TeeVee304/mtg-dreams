import { useState } from 'react'
import { cleanError } from '../lib/format'

/**
 * Runs an async action with busy state and captured error, ignoring calls while busy.
 * @returns `error` (cleaned message or null), `busy`, and `run`.
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
