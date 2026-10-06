/** @returns Scryfall CDN image URL for a card id and face; no API call needed. */
export function cardImageUrl(scryfallId: string, size: 'small' | 'normal', face: 'front' | 'back' = 'front'): string {
  return `https://cards.scryfall.io/${size}/${face}/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
