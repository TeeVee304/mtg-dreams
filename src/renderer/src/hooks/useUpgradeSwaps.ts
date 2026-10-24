import { useMemo } from 'react'
import { nameKey } from '@shared/decklist'
import { listCommanders } from '@shared/formats'
import { upgradeSwaps, upgradeTarget, upgradeVariant, upgradeVersion } from '@shared/listUpgrade'
import { baseCardLines, findVariant, versionCardLines } from '@shared/listVersion'
import { ui } from '@shared/text'
import { cutChoices } from '../lib/cutChoices'
import type { CardList } from '../stores/library'

/**
 * What an upgrade changes in the deck it upgrades, for its page's swap view.
 * @returns The swaps, the deck named (with the version planned, while the deck has it) and the cards
 * the upgrade can cut; null for decks, plain wishlists and upgrades of decks gone.
 */
export function useUpgradeSwaps(list: CardList, lists: CardList[]) {
  const deck = upgradeTarget(list, lists)
  return useMemo(() => {
    if (!deck) return null
    const swaps = upgradeSwaps(list.lines, deck.lines)
    const version = upgradeVariant(list.lines)
    const planned = version ? findVariant(deck.lines, version) : null
    const deckLabel = planned ? ui.upgradeSwaps.deckVersion(deck.name, planned.label) : deck.name
    // The deck's cards the upgrade still plays, but its commanders: those it can cut.
    const leaders = new Set(listCommanders(list.lines).map(nameKey))
    const inDeck = new Set(versionCardLines(deck.lines, upgradeVersion(list.lines)).map((line) => nameKey(line.name)))
    const outChoices = cutChoices(baseCardLines(list.lines), (key) => inDeck.has(key) && !leaders.has(key))
    return { deck, swaps, deckLabel, outChoices }
  }, [list.lines, deck])
}
