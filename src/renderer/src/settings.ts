import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../../shared/api'
import { DEFAULT_SORT } from '../../shared/cards'
import { DEFAULT_DROP_ALERT_PERCENT, DEFAULT_PRICE_BASIS } from '../../shared/pricing'
import { DEFAULT_THEME_COLOR } from '../../shared/themes'

// App settings, loaded once before the first render and saved on change.

let current: AppSettings = {
  theme: 'system',
  color: DEFAULT_THEME_COLOR,
  bundleBasics: true,
  tradeName: '',
  sort: DEFAULT_SORT,
  priceBasis: DEFAULT_PRICE_BASIS,
  dropAlertPercent: DEFAULT_DROP_ALERT_PERCENT
}
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The color theme is a page attribute the stylesheet keys its accent colors on. */
function applyColor(): void {
  document.documentElement.dataset.color = current.color
}

export async function loadSettings(): Promise<void> {
  try {
    current = await window.api.getSettings()
  } catch {
    // Keep the defaults.
  }
  applyColor()
}

export function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  current = { ...current, ...patch }
  applyColor()
  for (const listener of listeners) listener()
  return window.api.updateSettings(patch)
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, () => current)
}
