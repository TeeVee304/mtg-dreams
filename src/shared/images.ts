/** Scryfall's image CDN is keyed by card id, so an image needs no API call. */
export function cardImageUrl(scryfallId: string, size: 'small' | 'normal'): string {
  return `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}
