import { useEffect, useState } from 'react'
import type { DeckTokenData } from '@shared/tokens'

/** Token data per card set, for the session. */
const cache = new Map<string, DeckTokenData>()

/** Delay before fetching after the list changes, so edits settle first. */
const SETTLE_MS = 700

/** Fallback when the request itself fails. */
const UNAVAILABLE: DeckTokenData = { makers: {}, tokens: {}, available: false }

/**
 * Fetches token data for a list, debounced and cached per card set.
 * @param names - Card names (main deck); null disables fetching.
 * @returns Data; undefined while loading or disabled.
 */
export function useDeckTokens(names: string[] | null): DeckTokenData | undefined {
  const key = names ? JSON.stringify([...new Set(names)].sort()) : ''
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!key || cache.has(key)) return
    const list = (JSON.parse(key) as string[]).slice(0, 250)
    let cancelled = false
    const timer = setTimeout(() => {
      window.api
        .getDeckTokens(list)
        .then(
          (data) => cache.set(key, data),
          () => cache.set(key, UNAVAILABLE)
        )
        .finally(() => !cancelled && setVersion((v) => v + 1))
    }, SETTLE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key])

  return key ? cache.get(key) : undefined
}
