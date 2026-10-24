import { useEffect, useState } from 'react'
import { NO_FILTERS } from '@shared/deckWizard/averageDeck'
import { promiseCache } from '@shared/promiseCache'

/** Theme names by commanders, asked for once while they hold. */
const cache = promiseCache<string[]>(40)

/** @returns The commanders' themes on EDHREC, most decks first; null when it has no deck for them. */
async function themesOf(commanders: string[]): Promise<string[] | null> {
  const result = await window.deckWizard.averageDeck(commanders, NO_FILTERS)
  return result.status === 'ok' ? result.deck.themes.map((theme) => theme.name) : null
}

/**
 * @param commanders - The commander, or two: partners, or a commander then its Background.
 * @returns Their themes on EDHREC, most decks first: a pair EDHREC has no deck for (often a
 * commander with a Background) gets the first commander's own; none when it has neither.
 * @throws Error when EDHREC can't be reached; asking again tries again.
 */
export function commanderThemes(commanders: string[]): Promise<string[]> {
  return cache.get(commanders.join('\n'), async () => {
    if (commanders.length === 1) return (await themesOf(commanders)) ?? []
    // EDHREC answers a pair it lacks with a page that has no deck, which reads as an error.
    const pair = await themesOf(commanders).catch(() => null)
    return pair ?? (await themesOf(commanders.slice(0, 1))) ?? []
  })
}

/** @returns The commanders' EDHREC themes, most decks first; none while loading, or offline. */
export function useCommanderThemes(commanders: string[]): string[] {
  const key = commanders.join('\n')
  const [themes, setThemes] = useState<{ key: string; names: string[] }>({ key: '', names: [] })
  useEffect(() => {
    if (!key) return
    let current = true
    commanderThemes(key.split('\n'))
      .then((names) => current && setThemes({ key, names }))
      .catch(() => current && setThemes({ key, names: [] }))
    return () => {
      current = false
    }
  }, [key])
  return themes.key === key ? themes.names : []
}
