import type { ColorFilter } from './cards'
import { apca, chroma, contrast, distance, fromOklab, lightness, oklab, over, rgba, tuneToContrast } from './color'

/**
 * Deck palettes: one per color identity (32), each a combination from Sanzo Wada's *A Dictionary of
 * Color Combinations*, a color analysis from Emily Noyes Vanderpoel's *Color Problems* (1902), or
 * colors of Le Corbusier's *Polychromie architecturale*. A palette paints a deck page's ground,
 * washes, banner and accent; its text stays in the palette's own paper and ink.
 *
 * @packageDocumentation
 */

/** A color identity, its colors in WUBRG order (`WU`, `UBR`…), or `C` for colorless. */
export type IdentityKey = string

/** What stands for a mana color: one of the palette's swatches, or its paper or ink ground. */
type Role = number | 'paper' | 'ink'

interface Pick {
  swatches: string[]
  /** Which swatch stands for each of the identity's colors. */
  roles: Partial<Record<Exclude<ColorFilter, 'C'>, Role>>
  /** The swatch the accent comes from; the identity's most saturated by default. */
  accent?: number
}

/**
 * The palettes picked for each identity (2026-10-31; Grixis, Orzhov, Esper, Rakdos, Gruul and Dimir revised
 * 2026-11-01 against their top Commanders' art), credited by source. Mono palettes are a tint, the
 * color and a shade; the colorless one is Le Corbusier's, desaturated.
 */
const PICKS: Record<IdentityKey, Pick> = {
  W: { swatches: ['#dfded4', '#dcdac4', '#353423'], roles: { W: 1 } }, // Vanderpoel, Cream White Flowers
  U: { swatches: ['#c2e3fd', '#005b8d', '#003661'], roles: { U: 1 } }, // Wada, Helvetia Blue
  B: { swatches: ['#eed3f7', '#59256a', '#491a58'], roles: { B: 1 } }, // Wada, Red Violet
  R: { swatches: ['#ffd1c7', '#a14737', '#601105'], roles: { R: 1 } }, // Vanderpoel, Red
  G: { swatches: ['#cde6ce', '#82b786', '#0f3d17'], roles: { G: 1 } }, // Vanderpoel, Green
  WU: { swatches: ['#fff1ce', '#366c8e', '#585d5e'], roles: { W: 0, U: 1 } }, // Le Corbusier 1931
  UB: { swatches: ['#97acc8', '#051230', '#b6bfc1'], roles: { U: 0, B: 1 } }, // Wada 139
  BR: { swatches: ['#802626', '#eea78c', '#4f4086'], roles: { R: 0, B: 2 } }, // Wada 205
  RG: { swatches: ['#7c4226', '#d8a37b', '#555832'], roles: { R: 0, G: 2 } }, // Wada 121
  WG: { swatches: ['#fff1ce', '#39774f'], roles: { W: 0, G: 1 } }, // Le Corbusier 1931
  WB: { swatches: ['#dedfd7', '#2a2a2a', '#ce8f39'], roles: { W: 0, B: 1 }, accent: 2 }, // Vanderpoel, A Book Advertisement
  UR: { swatches: ['#cc1236', '#fff200', '#006eb8'], roles: { U: 2, R: 0 } }, // Wada 154
  BG: { swatches: ['#c1c494', '#437742', '#253122', '#501345'], roles: { B: 2, G: 1 } }, // Wada 348
  WR: { swatches: ['#f8b6ba', '#a84222', '#f5ecc2', '#fdc57e'], roles: { W: 2, R: 1 } }, // Wada 246
  UG: { swatches: ['#437742', '#064f6e'], roles: { U: 1, G: 0 } }, // Wada 5
  WUG: { swatches: ['#f5ecc2', '#fdbf68', '#437742', '#97acc8'], roles: { W: 0, U: 3, G: 2 } }, // Wada 294
  WUB: { swatches: ['#005b8d', '#c0a9b3', '#a36aa5'], roles: { U: 0, W: 'paper', B: 2 } }, // Wada 187
  UBR: { swatches: ['#ab2439', '#986f2d', '#97acc8'], roles: { R: 0, U: 2, B: 'ink' } }, // Wada 212
  BRG: { swatches: ['#f48067', '#437742', '#253122', '#a5c8d1'], roles: { B: 2, R: 0, G: 1 } }, // Wada 341
  WRG: { swatches: ['#fff1ce', '#884333', '#87b26c'], roles: { W: 0, R: 1, G: 2 } }, // Le Corbusier 1931
  WBG: { swatches: ['#fdbf68', '#d6b43e', '#437742', '#004f46'], roles: { G: 2, W: 'paper', B: 'ink' } }, // Wada 278
  WUR: { swatches: ['#fff1ce', '#366c8e', '#884333', '#96b4c9'], roles: { W: 0, U: 1, R: 2 } }, // Le Corbusier 1931
  UBG: { swatches: ['#366c8e', '#39774f', '#b3c8cd'], roles: { U: 0, G: 1, B: 'ink' } }, // Le Corbusier 1931
  WBR: { swatches: ['#fffceb', '#2f2624', '#a33a29', '#333230'], roles: { W: 0, B: 1, R: 2 } }, // Le Corbusier 1959
  URG: { swatches: ['#366c8e', '#884333', '#39774f', '#7e7f7e'], roles: { U: 0, R: 1, G: 2 } }, // Le Corbusier 1931
  UBRG: { swatches: ['#a62c37', '#819238', '#12354e', '#34454c'], roles: { U: 2, R: 0, G: 1, B: 'ink' } }, // Wada 245
  WBRG: { swatches: ['#82b786', '#d24b3d', '#ce9a4d', '#e0e0d9', '#1e2021'], roles: { W: 3, B: 4, R: 1, G: 0 } }, // Vanderpoel, Celtic Ornament
  WURG: { swatches: ['#ae5224', '#f8ed43', '#96d1aa', '#006eb8'], roles: { U: 3, R: 0, G: 2, W: 'paper' } }, // Wada 333
  WUBG: { swatches: ['#f5ecc2', '#437742', '#97acc8'], roles: { W: 0, U: 2, G: 1, B: 'ink' } }, // Wada 135
  WUBR: { swatches: ['#395a8e', '#080f15', '#a33a29', '#fffceb'], roles: { W: 3, U: 0, B: 1, R: 2 } }, // Le Corbusier 1959
  // Vanderpoel, A Rose-Colored Vase
  WUBRG: {
    swatches: ['#db9fa2', '#dfe0da', '#607442', '#e2d62d', '#b32b41', '#b3c028', '#455e90'],
    roles: { W: 1, U: 6, B: 'ink', R: 4, G: 2 },
    accent: 4
  },
  C: { swatches: ['#909293', '#bf9ea5', '#505254'], roles: {}, accent: 1 } // Le Corbusier 1959, desaturated
}

/** The palettes' identities, grouped as the Color dialog lists them. */
export const PALETTE_GROUPS: Array<{ id: string; keys: IdentityKey[] }> = [
  { id: 'mono', keys: ['W', 'U', 'B', 'R', 'G'] },
  { id: 'guilds', keys: ['WU', 'UB', 'BR', 'RG', 'WG', 'WB', 'UR', 'BG', 'WR', 'UG'] },
  { id: 'shards', keys: ['WUG', 'WUB', 'UBR', 'BRG', 'WRG'] },
  { id: 'wedges', keys: ['WBG', 'WUR', 'UBG', 'WBR', 'URG'] },
  { id: 'four', keys: ['UBRG', 'WBRG', 'WURG', 'WUBG', 'WUBR'] },
  { id: 'five', keys: ['WUBRG'] },
  { id: 'colorless', keys: ['C'] }
]

/** A palette's colors in one mode. */
export interface PaletteTokens {
  /** The page. */
  ground: string
  /** Figures and Statistics panels. */
  panel: string
  /** Table sections, in turn. */
  washes: string[]
  /** The Commander section. */
  lead: string
  text: string
  muted: string
  line: string
  /** Fills, bars and large figures (3:1 on the ground). */
  accent: string
  /** Small accent text (4.5:1). */
  accentText: string
  /** Text on the accent. */
  accentInk: string
  /** Progress tracks, focus rings, the selection. */
  track: string
  /** Errors and warnings: the app's own, unless the accent would pass for one of them. */
  bad: string
  warn: string
}

/** A deck palette: both modes, plus what stays the same in both. */
export interface DeckPalette {
  key: IdentityKey
  swatches: string[]
  light: PaletteTokens
  dark: PaletteTokens
  /** The banner stays dark in both modes, shaded toward the accent. */
  banner: { ground: string; text: string; muted: string; glass: string; button: string }
  /** Theme stickers: three of the palette's own colors, each clear of the banner. */
  stickers: string[]
  /** Each sticker's ink: a deep or a light shade of its own color, whichever reads better. */
  stickerInks: string[]
}

const WHITE = '#ffffff'
const INK = '#111314'

/**
 * Error and warning colors to try, the app's own first (tokens.css): a red palette's accent would
 * pass for an error, so its errors turn raspberry and its warnings amber.
 */
const ALERTS = {
  light: { bad: ['#b02b25', '#a3195b', '#8e1f8a'], warn: ['#a34a06', '#835800', '#6b6000'] },
  dark: { bad: ['#f47a7a', '#f27aa8', '#d58cf0'], warn: ['#f2843f', '#e2b13f', '#cfc552'] }
}

/** The first alert color, tuned to read on every surface, that stays apart from the accent. */
function alertOf(candidates: string[], accents: string[], surfaces: string[], avoid: string[] = []): string {
  const tuned = candidates.map((color) => tuneToContrast(color, surfaces, 4.5))
  return tuned.find((color) => [...accents, ...avoid].every((other) => distance(color, other) > 0.06)) ?? tuned[tuned.length - 1]
}

/** @returns The identity's key, its colors in WUBRG order; null for no colors. */
export function identityKey(colors: readonly ColorFilter[]): IdentityKey | null {
  if (colors.length === 0) return null
  if (colors.every((color) => color === 'C')) return 'C'
  return 'WUBRG'
    .split('')
    .filter((color) => colors.includes(color as ColorFilter))
    .join('')
}

/**
 * Washes of `sources` over `ground`, dropping any that would vanish into it or repeat another. A pale
 * or vivid swatch is laid thinner, so no wash strays further than a quiet step from the ground.
 */
function washesOf(sources: string[], ground: string, alpha: number): string[] {
  const washes: string[] = []
  const quiet = (wash: string) => Math.abs(lightness(wash) - lightness(ground)) <= 0.08 && chroma(wash) <= 0.045
  for (const source of sources) {
    let wash = over(source, alpha, ground)
    for (let a = alpha; !quiet(wash) && a > 0.05; a -= 0.01) wash = over(source, a, ground)
    if (distance(wash, ground) < 0.015 || washes.some((other) => distance(other, wash) < 0.012)) continue
    washes.push(wash)
  }
  return washes
}

/** The faintest mix of `text` over `ground` that stays readable (4.6:1) on every surface. */
function mutedOf(text: string, ground: string, surfaces: string[]): string {
  for (let alpha = 0.5; alpha < 1; alpha += 0.01) {
    const muted = over(text, alpha, ground)
    if (surfaces.every((surface) => contrast(muted, surface) >= 4.6)) return muted
  }
  return text
}

function tokensOf(pick: Pick, mode: 'light' | 'dark', paper: string, ink: string, vivid: string, sources: string[]): PaletteTokens {
  const light = mode === 'light'
  const ground = light ? paper : ink
  const text = light ? ink : paper
  const lightest = [...pick.swatches].sort((a, b) => lightness(b) - lightness(a))[0]
  // As quiet as a wash: a vivid lightest swatch (Izzet's lemon) is laid thinner.
  let panel = over(lightest, light ? 0.22 : 0.08, ground)
  for (let a = light ? 0.22 : 0.08; chroma(panel) > 0.035 && a > 0.04; a -= 0.01) panel = over(lightest, a, ground)
  const washes = washesOf(sources, ground, light ? 0.16 : 0.2)
  if (washes.length < 2) washes.push(over(text, 0.05, ground))
  while (washes.length < 4) washes.push(washes[washes.length % 2])
  const lead = over(vivid, light ? 0.2 : 0.26, ground)
  const surfaces = [ground, panel, lead, ...washes]
  // Light mode: a darker accent carrying white ink; dark mode: a lighter one carrying the ground's ink.
  let accent = tuneToContrast(vivid, [ground, panel], 3)
  accent = light ? tuneToContrast(accent, [WHITE], 4.5) : tuneToContrast(accent, [ground], 4.5)
  const accentText = tuneToContrast(accent, surfaces, 4.5)
  const alerts = ALERTS[mode]
  const bad = alertOf(alerts.bad, [accent, accentText], surfaces)
  return {
    ground,
    panel,
    washes: washes.slice(0, 4),
    lead,
    text,
    muted: mutedOf(text, ground, surfaces),
    line: rgba(text, 0.1),
    accent,
    accentText,
    accentInk: light ? WHITE : ground,
    track: rgba(accent, light ? 0.16 : 0.26),
    bad,
    warn: alertOf(alerts.warn, [accent, accentText], surfaces, [bad])
  }
}

/** Least contrast between a sticker and the banner it sits on, so a dark sticker never sinks into it. */
const STICKER_ON_BANNER = 1.6

/** Three distinct stickers in the palette's own colors, each lightened only as far as it needs to stand off `banner`. */
function stickersOf(sources: string[], vivid: string, banner: string): string[] {
  const stickers: string[] = []
  // Colorful swatches first: a black or gray makes a dull sticker.
  const colorful = [...sources, vivid].sort((a, b) => Number(chroma(b) >= 0.03) - Number(chroma(a) >= 0.03))
  for (const source of colorful) {
    const sticker = tuneToContrast(source, [banner], STICKER_ON_BANNER)
    if (!stickers.some((other) => distance(other, sticker) < 0.05)) stickers.push(sticker)
  }
  for (let alpha = 0.35; stickers.length < 3; alpha += 0.2) stickers.push(over(WHITE, alpha, vivid))
  return stickers.slice(0, 3)
}

/** Lightness and the share of its chroma a sticker's deep and light inks start from, before reaching 4.5:1. */
const STICKER_INK = { deep: { L: 0.22, chroma: 0.6 }, light: { L: 0.98, chroma: 0.25 } }

/** A sticker's ink: a deep or a light shade of its own hue, at 4.5:1 or more, whichever reads better (APCA). */
function stickerInkOf(sticker: string): string {
  const [, a, b] = oklab(sticker)
  const shade = (L: number, share: number) => fromOklab([L, a * share, b * share])
  let deep = shade(STICKER_INK.deep.L, STICKER_INK.deep.chroma)
  for (let L = STICKER_INK.deep.L; contrast(deep, sticker) < 4.5 && L > 0; L -= 0.02) deep = shade(L, STICKER_INK.deep.chroma)
  let light = shade(STICKER_INK.light.L, STICKER_INK.light.chroma)
  // Toward white, its tint fading as it goes.
  for (let share = STICKER_INK.light.chroma; contrast(light, sticker) < 4.5 && share > 0; share -= 0.05) light = shade(1, share)
  if (contrast(light, sticker) < 4.5) light = WHITE
  const candidates = [deep, light].filter((ink) => contrast(ink, sticker) >= 4.5)
  return candidates.sort((x, y) => apca(y, sticker) - apca(x, sticker))[0] ?? (lightness(sticker) > 0.6 ? '#000000' : WHITE)
}

function derive(key: IdentityKey, pick: Pick): DeckPalette {
  const { swatches } = pick
  const roleSwatches = Object.values(pick.roles).filter((role): role is number => typeof role === 'number')
  const own = roleSwatches.length > 0 ? roleSwatches.map((i) => swatches[i]) : swatches
  const vivid = pick.accent !== undefined ? swatches[pick.accent] : [...own].sort((a, b) => chroma(b) - chroma(a))[0]
  const lightest = [...swatches].sort((a, b) => lightness(b) - lightness(a))[0]
  // The darkest, most saturated swatch tints the ink: dark and chromatic beats dark and gray.
  const deepest = [...swatches].sort((a, b) => lightness(a) - 2 * chroma(a) - (lightness(b) - 2 * chroma(b)))[0]
  const paper = over(lightest, 0.07, WHITE)
  const ink = over(deepest, 0.12, INK)
  // Washes: the identity's own swatches first, then the rest of the combination.
  const sources = [...own, ...swatches.filter((swatch) => !own.includes(swatch))]
  const bannerGround = over(vivid, 0.32, INK)
  const bannerText = over(lightest, 0.06, WHITE)
  const stickers = stickersOf(sources, vivid, bannerGround)
  let bannerMuted = over(bannerText, 0.8, bannerGround)
  for (let alpha = 0.8; contrast(bannerMuted, bannerGround) < 4.5 && alpha < 1; alpha += 0.02) bannerMuted = over(bannerText, alpha, bannerGround)
  return {
    key,
    swatches,
    light: tokensOf(pick, 'light', paper, ink, vivid, sources),
    dark: tokensOf(pick, 'dark', paper, ink, vivid, sources),
    banner: { ground: bannerGround, text: bannerText, muted: bannerMuted, glass: rgba(bannerGround, 0.6), button: rgba(over(INK, 0.5, bannerGround), 0.62) },
    stickers,
    stickerInks: stickers.map(stickerInkOf)
  }
}

const cache = new Map<IdentityKey, DeckPalette>()

/** @returns The identity's palette; null for an identity without one. */
export function deckPalette(key: IdentityKey | null): DeckPalette | null {
  if (!key || !PICKS[key]) return null
  let palette = cache.get(key)
  if (!palette) cache.set(key, (palette = derive(key, PICKS[key])))
  return palette
}

/** Every palette's identity. */
export const PALETTE_KEYS: IdentityKey[] = PALETTE_GROUPS.flatMap((group) => group.keys)
