// The app's color themes, one per mana color plus Colorless (the gold in grayscale),
// each with its own icon. Combined with the light / dark / system mode, they make the
// app's look. White (gold) is the default.

export type ThemeColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export const THEME_COLORS: Array<{ id: ThemeColor; label: string; look: string }> = [
  { id: 'W', label: 'White', look: 'gold' },
  { id: 'U', label: 'Blue', look: 'blue' },
  { id: 'B', label: 'Black', look: 'purple' },
  { id: 'R', label: 'Red', look: 'red' },
  { id: 'G', label: 'Green', look: 'green' },
  { id: 'C', label: 'Colorless', look: 'gray' }
]

export const DEFAULT_THEME_COLOR: ThemeColor = 'W'

export function isThemeColor(value: unknown): value is ThemeColor {
  return THEME_COLORS.some((color) => color.id === value)
}
