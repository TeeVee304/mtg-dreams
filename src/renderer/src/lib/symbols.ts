import type { IconType } from './rulesText'

/** Scryfall card symbol SVGs (svgs.scryfall.io/card-symbols) by file name, inlined by Vite. */
const SYMBOL_FILES = import.meta.glob<string>('../assets/mana/*.svg', { eager: true, import: 'default' })
/** Card type icons from the Mana font by Andrew Gioia (SIL OFL 1.1), drawn as masks in the text color. */
const TYPE_FILES = import.meta.glob<string>('../assets/types/*.svg', { eager: true, import: 'default' })

/** @returns The image of a symbol, written without braces (`W/U`); null for one with none (`½`, `∞`). */
export function symbolImage(symbol: string): string | null {
  return SYMBOL_FILES[`../assets/mana/${symbol.replace(/\//g, '').toUpperCase()}.svg`] ?? null
}

/** @returns The icon of a card type. */
export const typeImage = (type: IconType): string => TYPE_FILES[`../assets/types/${type}.svg`]
