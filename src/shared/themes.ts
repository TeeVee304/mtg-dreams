import { COLOR_LETTERS, COLOR_NAMES, type ColorFilter } from './cards'

/** Accent theme, one per mana color plus Colorless; each has its own app icon. */
export type ThemeColor = ColorFilter

/** Accent hue of each theme. */
const LOOKS: Record<ThemeColor, string> = { W: 'gold', U: 'blue', B: 'purple', R: 'red', G: 'green', C: 'gray' }

/** Theme colors with UI label and accent hue name. */
export const THEME_COLORS: Array<{ id: ThemeColor; label: string; look: string }> = COLOR_LETTERS.map((id) => ({
  id,
  label: COLOR_NAMES[id],
  look: LOOKS[id]
}))

/** Default theme (gold). */
export const DEFAULT_THEME_COLOR: ThemeColor = 'W'

/** Type guard for {@link ThemeColor}. */
export function isThemeColor(value: unknown): value is ThemeColor {
  return THEME_COLORS.some((color) => color.id === value)
}
