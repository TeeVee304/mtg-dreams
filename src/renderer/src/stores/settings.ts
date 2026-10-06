import { useSyncExternalStore } from 'react'
import type { AppSettings } from '@shared/api'
import { DEFAULT_SORT } from '@shared/cards'
import { DEFAULT_COPIES } from '@shared/copies'
import { DEFAULT_DROP_ALERT_PERCENT, DEFAULT_PRICE_BASIS } from '@shared/pricing'
import { DEFAULT_THEME_COLOR } from '@shared/themes'

/** Current settings; defaults until {@link loadSettings} resolves. */
let current: AppSettings = {
  theme: 'system',
  color: DEFAULT_THEME_COLOR,
  bundleBasics: true,
  copies: DEFAULT_COPIES,
  cardImages: true,
  cardView: 'table',
  tradeName: '',
  sort: DEFAULT_SORT,
  priceBasis: DEFAULT_PRICE_BASIS,
  dropAlertPercent: DEFAULT_DROP_ALERT_PERCENT
}
const listeners = new Set<() => void>()

/** `useSyncExternalStore` subscribe. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Sets `data-color` on `<html>`, which keys the accent palette in CSS. */
function applyColor(): void {
  document.documentElement.dataset.color = current.color
}

/** Loads settings from the main process (defaults kept on failure) and applies the color theme. */
export async function loadSettings(): Promise<void> {
  try {
    current = await window.api.getSettings()
  } catch {}
  applyColor()
}

/** Applies a patch locally, notifies subscribers and persists it. */
export function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  current = { ...current, ...patch }
  applyColor()
  for (const listener of listeners) listener()
  return window.api.updateSettings(patch)
}

/** Hook returning current settings. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, () => current)
}
