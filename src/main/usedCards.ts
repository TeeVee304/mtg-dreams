import type { LoadedData } from '@shared/api'
import { cardLines, nameKey, parseList } from '@shared/decklist'
import { parseTradeText } from '@shared/trade'

/**
 * @returns nameKeys of the Cards the data folder uses: in its decks, wishlists, brews, inventory and
 * friends' trade lists. The Scryfall cache keeps these as long as they stay used.
 */
export function usedCardKeys(data: LoadedData): Set<string> {
  const keys = new Set<string>()
  const addList = (text: string) => {
    for (const card of cardLines(parseList(text))) keys.add(nameKey(card.name))
  }
  for (const file of [...data.decks, ...data.wishlists, ...data.brews]) addList(file.text)
  addList(data.inventory)
  for (const file of data.trades) {
    try {
      const trade = parseTradeText(file.text, file.name)
      for (const card of [...trade.haves, ...trade.wants]) keys.add(nameKey(card.name))
    } catch {}
  }
  return keys
}
