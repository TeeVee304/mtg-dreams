/** @returns Scryfall CDN image URL for a card id and face; no API call needed. */
export function cardImageUrl(scryfallId: string, size: 'small' | 'normal', face: 'front' | 'back' = 'front'): string {
  return `https://cards.scryfall.io/${size}/${face}/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}

/** Scheme the main process serves saved card images under (see `main/cardImages.ts`). */
export const SAVED_IMAGE_SCHEME = 'card-image'

/** A small Scryfall card image, with its face, id and any version query. */
const SMALL_IMAGE = /^https:\/\/cards\.scryfall\.io\/small\/(front|back)\/([0-9a-f])\/([0-9a-f])\/([0-9a-f-]{36})\.jpg(?:\?\d*)?$/

/**
 * @returns A small Scryfall card image's address in the app's image store, which keeps it for use
 * offline; other images unchanged. For the Cards the files use: browsing other Versions stays online.
 */
export function savedCardImage(src: string): string
export function savedCardImage(src: string | null | undefined): string | null | undefined
export function savedCardImage(src: string | null | undefined): string | null | undefined {
  const match = src ? SMALL_IMAGE.exec(src) : null
  return match ? `${SAVED_IMAGE_SCHEME}://scryfall/small/${match[1]}/${match[2]}/${match[3]}/${match[4]}.jpg` : src
}
