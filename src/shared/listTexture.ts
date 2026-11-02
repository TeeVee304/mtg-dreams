import { listHeader } from './decklist'
import { TEXTURES, type Texture } from './temperaments'
import type { ListLine } from './types'

/** Banner texture header of a list file: `// Texture: grain`. */
const TEXTURE = listHeader('Texture')

/** @returns The banner texture the list sets; null for none, the default. */
export function listTexture(lines: ListLine[]): Texture | null {
  const value = TEXTURE.read(lines)?.trim().toLowerCase()
  return TEXTURES.find((texture) => texture === value) ?? null
}

/** Sets the banner texture, or removes the header (`null`): no texture. */
export function withTexture(lines: ListLine[], texture: Texture | null): ListLine[] {
  // Written with the other list headers, before the first card.
  return TEXTURE.write(lines, texture, (rest) => {
    const index = rest.findIndex((line) => line.kind === 'card')
    return index < 0 ? rest.length : index
  })
}
