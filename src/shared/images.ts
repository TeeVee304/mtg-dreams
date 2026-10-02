/** @returns Scryfall CDN image URL for a card id (front face); no API call needed. */
export function cardImageUrl(scryfallId: string, size: 'small' | 'normal'): string {
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
