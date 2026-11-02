/**
 * Deck page display faces and banner textures a list can choose in its Style dialog. A list that
 * chooses none keeps the app's display face (Fraunces) and no texture: nothing is picked for it.
 *
 * @packageDocumentation
 */

/** A display face a list can choose, keyed by its mood. */
export type Temperament =
  | 'divine' | 'gothic' | 'brutal' | 'mythic' | 'arcane' | 'mechanical' | 'retro' | 'courtly' | 'outlaw' | 'deco' | 'fey'

/** Shape of the Background and Companion badges by the commander's portrait. */
export type BadgeShape = 'circle' | 'square' | 'diamond'

/**
 * Banner textures, printed or engraved, each an SVG in assets/textures; a deck has none unless it sets one.
 * Identity tiles the deck's watermark, so it only exists for mono-color and two-color palettes.
 */
export const TEXTURES = [
  'grain', 'mezzotint', 'halftone', 'hatch', 'crosshatch', 'ruled', 'chevron', 'guilloche', 'perlage', 'sunburst', 'identity'
] as const

export type Texture = (typeof TEXTURES)[number]

/** @returns Whether the palette of this identity key (WUBRG order) can draw the identity texture. */
export function hasIdentityTexture(key: string | null | undefined): boolean {
  return !!key && /^[WUBRG]{1,2}$/.test(key)
}

export interface TemperamentStyle {
  /** The display face's name, as the Style dialog lists it and the typeface header names it. */
  name: string
  /** The display face's family (bundled), with fallbacks. */
  face: string
  weight: number
  /** Title size, px. */
  size: number
  /** Uppercase titles. */
  caps: boolean
  /** The face has an italic, which the epigraph uses; else the epigraph is in the body face. */
  italic: boolean
  /** The face is only shown in italic. */
  slanted: boolean
}

/** The app's own display face, which a deck page keeps until its list chooses another. */
export const DEFAULT_FACE: TemperamentStyle = { name: 'Fraunces', face: "'Fraunces', Georgia, serif", weight: 600, size: 46, caps: false, italic: false, slanted: false }

export const TEMPERAMENTS: Record<Temperament, TemperamentStyle> = {
  divine: { name: 'Cinzel', face: "'Cinzel', Georgia, serif", weight: 700, size: 44, caps: false, italic: false, slanted: false },
  gothic: { name: 'IM Fell English', face: "'IM Fell English', Georgia, serif", weight: 400, size: 50, caps: false, italic: true, slanted: false },
  brutal: { name: 'Anton', face: "'Anton', Impact, sans-serif", weight: 400, size: 56, caps: true, italic: false, slanted: false },
  mythic: { name: 'Uncial Antiqua', face: "'Uncial Antiqua', Georgia, serif", weight: 400, size: 46, caps: false, italic: false, slanted: false },
  arcane: { name: 'Bodoni Moda', face: "'Bodoni Moda', Didot, serif", weight: 700, size: 48, caps: false, italic: true, slanted: true },
  mechanical: { name: 'Archivo Expanded', face: "'Archivo Expanded', 'Segoe UI', sans-serif", weight: 800, size: 40, caps: true, italic: false, slanted: false },
  retro: { name: 'Silkscreen', face: "'Silkscreen', Consolas, monospace", weight: 400, size: 40, caps: false, italic: false, slanted: false },
  courtly: { name: 'Pirata One', face: "'Pirata One', Georgia, serif", weight: 400, size: 56, caps: false, italic: false, slanted: false },
  outlaw: { name: 'Rye', face: "'Rye', Georgia, serif", weight: 400, size: 42, caps: false, italic: false, slanted: false },
  deco: { name: 'Limelight', face: "'Limelight', Georgia, serif", weight: 400, size: 44, caps: false, italic: false, slanted: false },
  fey: { name: 'Henny Penny', face: "'Henny Penny', Georgia, serif", weight: 400, size: 44, caps: false, italic: false, slanted: false }
}
