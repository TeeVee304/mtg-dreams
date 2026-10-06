import { useState } from 'react'

/** @returns Stored flag; `fallback` if unset or storage is unavailable. */
function read(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}

/**
 * Boolean UI state persisted in localStorage (e.g. a panel's open state); storage errors are ignored.
 * @param key - localStorage key.
 * @param fallback - Initial value when nothing is stored.
 * @returns Current value and a toggle.
 */
export function useStoredToggle(key: string, fallback: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => read(key, fallback))
  const toggle = () => {
    setValue(!value)
    try {
      localStorage.setItem(key, String(!value))
    } catch {}
  }
  return [value, toggle]
}
