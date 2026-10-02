/** Accent theme, one per mana color plus Colorless; each has its own app icon. */
export type ThemeColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

/** Theme colors with UI label and accent hue name. */
export const THEME_COLORS: Array<{ id: ThemeColor; label: string; look: string }> = [
  { id: 'W', label: 'White', look: 'gold' },
  { id: 'U', label: 'Blue', look: 'blue' },
  { id: 'B', label: 'Black', look: 'purple' },
  { id: 'R', label: 'Red', look: 'red' },
  { id: 'G', label: 'Green', look: 'green' },
  { id: 'C', label: 'Colorless', look: 'gray' }
]

/** Default theme (gold). */
export const DEFAULT_THEME_COLOR: ThemeColor = 'W'

/** Type guard for {@link ThemeColor}. */
export function isThemeColor(value: unknown): value is ThemeColor {
  return THEME_COLORS.some((color) => color.id === value)
}
