import { useState } from 'react'

/**
 * String UI state persisted in localStorage (e.g. a page's sort or tab); storage errors are ignored.
 * @param key - localStorage key.
 * @param fallback - Value when nothing valid is stored.
 * @param isValid - Accepts a stored value.
 * @returns Current value and a setter.
 */
export function useStoredValue<T extends string>(key: string, fallback: T, isValid: (value: string) => value is T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null && isValid(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })
  const update = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, next)
    } catch {}
  }
  return [value, update]
}
