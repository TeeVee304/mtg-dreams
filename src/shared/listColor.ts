import type { ColorFilter } from './cards'
import { colorIdentityName, identityOfName } from './colorIdentity'
import { listHeader } from './decklist'
import { deckPalette, identityKey, type IdentityKey } from './deckPalettes'
import { THEME_COLORS, type ThemeColor } from './themes'
import type { ListLine } from './types'

/** Color header line: `// Color: <label, id or identity>`, the list's accent in the app. */
const COLOR = listHeader('Color', 'colou?r')

/** Palette header line: `// Palette: <identity>`, the palette a deck page takes instead of its own identity's. */
const PALETTE = listHeader('Palette')

/**
 * @returns The colors the color header names: a theme color (`Blue`, `U`), an identity (`Azorius`,
 * `Mono-Green`) or its letters (`WU`); null if none or unknown.
 */
function headerColors(lines: ListLine[]): ColorFilter[] | null {
  const value = COLOR.read(lines)?.trim()
  if (!value) return null
  const theme = THEME_COLORS.find((color) => color.id.toLowerCase() === value.toLowerCase() || color.label.toLowerCase() === value.toLowerCase())
  if (theme) return [theme.id]
  const named = identityOfName(value)
  if (named) return named
  if (/^[wubrg]+$/i.test(value)) return value.toUpperCase().split('') as ColorFilter[]
  return null
}

/** @returns Theme color the color header names: its color, or an identity's first; null if none or unknown. */
export function listColor(lines: ListLine[]): ThemeColor | null {
  return headerColors(lines)?.[0] ?? null
}

/**
 * @returns Palette the palette header names, by its identity's name (`Gruul`, `Mono-Red`, `Colorless`);
 * null if none or unknown. The color header never sets it: it is the list's accent in the app.
 */
export function listPalette(lines: ListLine[]): IdentityKey | null {
  const value = PALETTE.read(lines)?.trim()
  const colors = value ? identityOfName(value) : null
  const key = colors && identityKey(colors)
  return key && deckPalette(key) ? key : null
}

/**
 * Replaces the color header, placing it first.
 * @param color - Theme color; null removes the header.
 */
export function withColor(lines: ListLine[], color: ThemeColor | null): ListLine[] {
  return COLOR.write(lines, THEME_COLORS.find((option) => option.id === color)?.label ?? null)
}

/**
 * Replaces the palette header, by its identity's name (`Azorius`).
 * @param key - Palette identity; null removes the header, leaving the palette to the deck's identity.
 */
export function withPalette(lines: ListLine[], key: IdentityKey | null): ListLine[] {
  const name = key ? colorIdentityName(key.split('') as ColorFilter[]) : null
  return PALETTE.write(lines, name)
}
