import { newLineId } from './decklist'
import { THEME_COLORS, type ThemeColor } from './themes'
import type { ListLine } from './types'

/** Color header line stored in the list file: `// Color: <label or id>`. */
const COLOR_LINE = /^\/\/\s*colou?r\s*:\s*(.*?)\s*$/i

/** Text line holding a color header. */
const isColorLine = (line: ListLine) => line.kind === 'text' && COLOR_LINE.test(line.text.trim())

/** @returns Color named by the first color header (matched by label or id, case-insensitive); null if none or unknown. */
export function listColor(lines: ListLine[]): ThemeColor | null {
  for (const line of lines) {
    if (line.kind !== 'text') continue
    const match = COLOR_LINE.exec(line.text.trim())
    if (!match) continue
    const value = match[1].toLowerCase()
    return THEME_COLORS.find((color) => color.id.toLowerCase() === value || color.label.toLowerCase() === value)?.id ?? null
  }
  return null
}

/**
 * Replaces the color header, placing it first.
 * @param color - Theme color; null removes the header.
 */
export function withColor(lines: ListLine[], color: ThemeColor | null): ListLine[] {
  const rest = lines.filter((line) => !isColorLine(line))
  const label = THEME_COLORS.find((option) => option.id === color)?.label
  return label ? [{ kind: 'text', id: newLineId(), text: `// Color: ${label}` }, ...rest] : rest
}
