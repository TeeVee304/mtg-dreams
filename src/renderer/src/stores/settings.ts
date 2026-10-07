import type { AppSettings } from '@shared/api'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { createSignal } from '../lib/signal'

/** Current settings; defaults until {@link loadSettings} resolves. */
let current: AppSettings = DEFAULT_SETTINGS
const changes = createSignal()

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
  changes.emit()
  return window.api.updateSettings(patch)
}

/** Hook returning current settings. */
export function useSettings(): AppSettings {
  changes.useVersion()
  return current
}
