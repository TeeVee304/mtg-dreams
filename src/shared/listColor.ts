import { listHeader } from './decklist'
import { THEME_COLORS, type ThemeColor } from './themes'
import type { ListLine } from './types'

/** Color header line stored in the list file: `// Color: <label or id>`. */
const COLOR = listHeader('Color', 'colou?r')

/** @returns Color named by the first color header (matched by label or id, case-insensitive); null if none or unknown. */
export function listColor(lines: ListLine[]): ThemeColor | null {
  const value = COLOR.read(lines)?.toLowerCase()
  return THEME_COLORS.find((color) => color.id.toLowerCase() === value || color.label.toLowerCase() === value)?.id ?? null
}

/**
 * Replaces the color header, placing it first.
 * @param color - Theme color; null removes the header.
 */
export function withColor(lines: ListLine[], color: ThemeColor | null): ListLine[] {
  return COLOR.write(lines, THEME_COLORS.find((option) => option.id === color)?.label ?? null)
}
