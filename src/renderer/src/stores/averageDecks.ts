import { useEffect, useState } from 'react'
import { BRACKETS, NO_FILTERS, type AverageDeck } from '@shared/deckWizard/averageDeck'
import { promiseCache } from '@shared/promiseCache'

/**
 * EDHREC's average deck of a Deck's commanders, as its cards, for what compares a Deck against it
 * (the Bracket section's salt). Asked through the Deck Wizard's bridge, which caches its answers.
 *
 * @packageDocumentation
 */

/** The commanders' average deck, a card name a copy, and the bracket it was taken at. */
export interface AverageCards {
  names: string[]
  /** 1 to 5; null when it's the average over every bracket. */
  level: number | null
}

/** Answers kept this session; a failure isn't, so asking again tries again. */
const cache = promiseCache<AverageCards | null>(40)

/** @returns Its cards, commanders included, a name a copy. */
function namesOf(deck: AverageDeck): string[] {
  return [...deck.commanders, ...deck.cards.flatMap((card) => Array<string>(card.qty).fill(card.name))]
}

/**
 * @param level - The Deck's declared bracket: its average deck is the one compared, when EDHREC has it.
 * @returns The average deck's cards; null when EDHREC has none.
 * @throws Error when EDHREC can't be reached.
 */
function averageCards(commanders: string[], level: number | null): Promise<AverageCards | null> {
  return cache.get(`${commanders.join('\n')}|${level ?? ''}`, async () => {
    const at = async (bracket: number | null) => {
      const filters = bracket === null ? NO_FILTERS : { ...NO_FILTERS, bracket: BRACKETS[bracket - 1].id }
      const result = await window.deckWizard.averageDeck(commanders, filters)
      return result.status === 'ok' ? { names: namesOf(result.deck), level: bracket } : null
    }
    return (level !== null ? await at(level) : null) ?? (await at(null))
  })
}

/**
 * @param commanders - None asks for nothing.
 * @returns The commanders' average deck from EDHREC; null while loading, offline, or unknown.
 */
export function useAverageCards(commanders: string[], level: number | null): AverageCards | null {
  const key = commanders.length > 0 ? `${commanders.join('\n')}|${level ?? ''}` : ''
  const [found, setFound] = useState<{ key: string; cards: AverageCards | null }>({ key: '', cards: null })
  useEffect(() => {
    if (!key) return
    let current = true
    averageCards(commanders, level).then(
      (cards) => current && setFound({ key, cards }),
      () => current && setFound({ key, cards: null })
    )
    return () => {
      current = false
    }
    // The key holds the commanders and the level.
  }, [key])
  return found.key === key ? found.cards : null
}
