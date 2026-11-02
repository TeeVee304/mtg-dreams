import type { ColorFilter } from './cards'

/**
 * Names of color identities as players call them: mono colors, the ten guilds, the five shards and
 * five wedges, the five Nephilim for four colors, and WUBRG for all five.
 *
 * @packageDocumentation
 */

/** Names by identity, its colors in WUBRG order. */
const NAMES: Record<string, string> = {
  W: 'Mono-White',
  U: 'Mono-Blue',
  B: 'Mono-Black',
  R: 'Mono-Red',
  G: 'Mono-Green',
  C: 'Colorless',
  // Guilds
  WU: 'Azorius',
  UB: 'Dimir',
  BR: 'Rakdos',
  RG: 'Gruul',
  WG: 'Selesnya',
  WB: 'Orzhov',
  UR: 'Izzet',
  BG: 'Golgari',
  WR: 'Boros',
  UG: 'Simic',
  // Shards
  WUG: 'Bant',
  WUB: 'Esper',
  UBR: 'Grixis',
  BRG: 'Jund',
  WRG: 'Naya',
  // Wedges
  WBG: 'Abzan',
  WUR: 'Jeskai',
  UBG: 'Sultai',
  WBR: 'Mardu',
  URG: 'Temur',
  // Nephilim, named for the color they lack
  UBRG: 'Glint-Eye',
  WBRG: 'Dune-Brood',
  WURG: 'Ink-Treader',
  WUBG: 'Witch-Maw',
  WUBR: 'Yore-Tiller',
  WUBRG: 'WUBRG'
}

/** WUBRG order. */
const ORDER = 'WUBRGC'

/**
 * @param colors - Color identity, in any order; `C` alone for colorless.
 * @returns Its name, e.g. `Gruul` for R and G; null for no colors.
 */
export function colorIdentityName(colors: readonly ColorFilter[]): string | null {
  if (colors.length === 0) return null
  const key = [...new Set(colors)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join('')
  return NAMES[key] ?? null
}

/**
 * @param name - An identity's name (`Gruul`, `Mono-Blue`, `WUBRG`, `Colorless`), any case.
 * @returns Its colors in WUBRG order; `C` alone for colorless; null for no such name.
 */
export function identityOfName(name: string): ColorFilter[] | null {
  const wanted = name.trim().toLowerCase()
  const key = Object.keys(NAMES).find((colors) => NAMES[colors].toLowerCase() === wanted)
  return key ? (key.split('') as ColorFilter[]) : null
}
