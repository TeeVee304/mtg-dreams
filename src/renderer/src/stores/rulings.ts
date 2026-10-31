import { useEffect, useSyncExternalStore } from 'react'
import { nameKey } from '@shared/decklist'
import type { Ruling } from '@shared/types'

/**
 * Card rulings, for the card dialog, by card: requested when the dialog opens, kept for the session.
 * `null` when Scryfall couldn't be reached and nothing was cached; absent while unknown.
 */
const rulings = new Map<string, Ruling[] | null>()
/** Cards being looked up. */
const loading = new Set<string>()
const listeners = new Set<() => void>()
/** Changes on each answer, for `useSyncExternalStore`. */
let version = 0

/** @returns A card's rulings: undefined until looked up, null if unknown. */
export function rulingsOf(name: string): Ruling[] | null | undefined {
  return rulings.get(nameKey(name))
}

/** Looks a card's rulings up by one of its printings' Scryfall id, once per session (again after a miss). */
export function requestRulings(name: string, id: string): void {
  const key = nameKey(name)
  if (loading.has(key) || (rulings.has(key) && rulings.get(key) !== null)) return
  loading.add(key)
  window.api
    .getRulings(name, id)
    .catch(() => null)
    .then((found) => {
      loading.delete(key)
      rulings.set(key, found)
      version++
      for (const listener of listeners) listener()
    })
}

/**
 * @returns A card's rulings ({@link rulingsOf}), looked up by one of its printings' Scryfall id when
 * the caller mounts, and re-rendered on arrival.
 */
export function useRulings(name: string, id: string | undefined): Ruling[] | null | undefined {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version
  )
  useEffect(() => {
    if (id) requestRulings(name, id)
  }, [name, id])
  return rulingsOf(name)
}
