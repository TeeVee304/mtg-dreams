import { useEffect, useState } from 'react'
import { MAX_COMBO_CARDS, MAX_COMBO_COMMANDERS, NO_CARD_DATA, type BracketCardData, type SpellbookCombo } from '@shared/brackets'

/**
 * The Bracket section's service data: Scryfall's tags and EDHREC's salt, each on its own (salt
 * takes longer) and asked again after a miss, and each Deck's combos per card set, debounced like
 * its tokens. Tags mark Card rows, so they load with a Deck page; salt only shows in the open panel.
 *
 * @packageDocumentation
 */

/** Per-card facts so far; a part is null until it loads, or while unknown offline. */
let cards: BracketCardData = NO_CARD_DATA
/** The parts being fetched. */
const loading = { tags: false, salt: false }
const cardListeners = new Set<() => void>()

/** Tells every page using the per-card facts that they changed. */
const notify = () => {
  for (const listener of cardListeners) listener()
}

/** Fetches Scryfall's tags and, with `salt`, EDHREC's salt: whichever is missing and not on its way. */
function fetchCards(salt: boolean): void {
  if (cards.landDenial === null && !loading.tags) {
    loading.tags = true
    window.api
      .getBracketTags()
      .then(
        (tags) => void (cards = { ...cards, ...tags }),
        () => undefined
      )
      .finally(() => {
        loading.tags = false
        notify()
      })
  }
  if (salt && cards.salt === null && !loading.salt) {
    loading.salt = true
    window.api
      .getBracketSalt()
      .then(
        (salt) => void (cards = { ...cards, salt }),
        () => undefined
      )
      .finally(() => {
        loading.salt = false
        notify()
      })
  }
}

/** Per-card facts, and whether a missing part is still on its way. */
export interface BracketCards {
  data: BracketCardData
  /** Tags are still loading. */
  tagsLoading: boolean
  /** Salt is still loading. */
  saltLoading: boolean
}

/**
 * @param enabled - Fetches Scryfall's tags.
 * @param salt - Fetches EDHREC's salt too.
 * @returns Per-card bracket facts; parts are null until they load.
 */
export function useBracketCards(enabled: boolean, salt: boolean): BracketCards {
  const [, setVersion] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const listener = () => setVersion((v) => v + 1)
    cardListeners.add(listener)
    fetchCards(salt)
    return () => void cardListeners.delete(listener)
  }, [enabled, salt])
  return { data: cards, tagsLoading: loading.tags, saltLoading: loading.salt }
}

/** Combos per card set, oldest first; null when Commander Spellbook couldn't be reached. */
const combos = new Map<string, SpellbookCombo[] | null>()
/** Card sets whose combos are kept this session: each settled edit makes another. */
const COMBOS_KEPT = 50

/** Keeps a card set's combos, forgetting the oldest past {@link COMBOS_KEPT}. */
function keepCombos(key: string, found: SpellbookCombo[] | null): void {
  combos.delete(key)
  combos.set(key, found)
  while (combos.size > COMBOS_KEPT) combos.delete(combos.keys().next().value!)
}

/** Delay before fetching after the list changes, so edits settle first. */
const SETTLE_MS = 700

/** A Deck's combos, and how to ask again after a miss. */
export interface DeckCombos {
  /** Undefined while loading, null when unchecked. */
  combos: SpellbookCombo[] | null | undefined
  retry: () => void
}

/**
 * @param commanders - The Deck's commanders, free combo pieces.
 * @param names - Its other cards; null disables fetching.
 */
export function useBracketCombos(commanders: string[], names: string[] | null): DeckCombos {
  const key = names ? JSON.stringify([[...new Set(commanders)].sort(), [...new Set(names)].sort()]) : ''
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!key || combos.has(key)) return
    const [leaders, cards] = JSON.parse(key) as [string[], string[]]
    let cancelled = false
    const timer = setTimeout(() => {
      window.api
        .getBracketCombos(leaders.slice(0, MAX_COMBO_COMMANDERS), cards.slice(0, MAX_COMBO_CARDS))
        .then(
          (found) => keepCombos(key, found),
          () => keepCombos(key, null)
        )
        .finally(() => !cancelled && setVersion((v) => v + 1))
    }, SETTLE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, version])

  return {
    combos: key ? combos.get(key) : undefined,
    retry: () => {
      combos.delete(key)
      fetchCards(true)
      setVersion((v) => v + 1)
    }
  }
}
