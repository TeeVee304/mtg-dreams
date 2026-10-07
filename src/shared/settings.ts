import type { AppSettings, Theme } from './api'
import { DEFAULT_SORT, isSortKey } from './cards'
import { DEFAULT_COPIES, isCopiesMode } from './copies'
import { DEFAULT_DROP_ALERT_PERCENT, DEFAULT_PRICE_BASIS, isPriceBasis } from './pricing'
import { DEFAULT_THEME_COLOR, isThemeColor } from './themes'

/** Settings before any change, and in place of invalid stored values. */
export const DEFAULT_SETTINGS: AppSettings = {
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

/** Longest trade list owner name. */
const MAX_TRADE_NAME = 100

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

/** Check of each setting's value, and what its error calls it. */
const CHECKS: { [K in keyof AppSettings]: [valid: (value: unknown) => value is AppSettings[K], what: string] } = {
  theme: [(value): value is Theme => value === 'system' || value === 'light' || value === 'dark', 'theme'],
  color: [isThemeColor, 'color'],
  bundleBasics: [isBoolean, 'setting'],
  copies: [isCopiesMode, 'setting'],
  cardImages: [isBoolean, 'setting'],
  cardView: [(value): value is AppSettings['cardView'] => value === 'table' || value === 'grid', 'view'],
  tradeName: [(value): value is string => typeof value === 'string' && value.length <= MAX_TRADE_NAME, 'name'],
  sort: [isSortKey, 'sort'],
  priceBasis: [isPriceBasis, 'price basis'],
  dropAlertPercent: [
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 90,
    'alert threshold'
  ]
}

const KEYS = Object.keys(CHECKS) as Array<keyof AppSettings>

/** @returns Stored settings, with the default for each missing or invalid value. */
export function validSettings(stored: Partial<Record<keyof AppSettings, unknown>>): AppSettings {
  const settings: Record<string, unknown> = {}
  for (const key of KEYS) settings[key] = CHECKS[key][0](stored[key]) ? stored[key] : DEFAULT_SETTINGS[key]
  return settings as unknown as AppSettings
}

/**
 * Validates a settings change from the renderer; unknown keys are dropped and the trade name trimmed.
 * @throws Error naming an invalid setting.
 */
export function settingsPatch(raw: unknown): Partial<AppSettings> {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const key of KEYS) {
    if (!(key in input)) continue
    const [valid, what] = CHECKS[key]
    const value = input[key]
    if (!valid(value)) throw new Error(`Invalid ${what}.`)
    patch[key] = typeof value === 'string' && key === 'tradeName' ? value.trim() : value
  }
  return patch as Partial<AppSettings>
}
