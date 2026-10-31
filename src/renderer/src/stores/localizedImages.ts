import { useSyncExternalStore } from 'react'
import { nameKey } from '@shared/decklist'
import type { CardLine, LocalizedImage, LocalizedQuery, Printing } from '@shared/types'

/**
 * Card images and printed text in a copy's language, for the hover preview and the card dialog, by
 * query: requested on hover or when the dialog opens, kept for the session. `null` once Scryfall has none in that language; absent while unknown.
 */
const images = new Map<string, LocalizedImage | null>()
/** Queries being looked up. */
const loading = new Set<string>()
const listeners = new Set<() => void>()
/** Changes on each answer, for `useSyncExternalStore`. */
let version = 0

/**
 * @returns What a line in another language shows: its card in that language, the printing shown
 * looked for first; undefined for English.
 */
export function localizedQueryOf(line: Pick<CardLine, 'name' | 'lang' | 'set' | 'collector'>, printing: Printing | null): LocalizedQuery | undefined {
  if (!line.lang) return undefined
  const set = printing?.set ?? line.set
  const collector = printing?.collectorNumber ?? line.collector
  return { name: line.name, lang: line.lang, ...(set && collector && { set, collector }) }
}

/** @returns A query's key: card, language and the printing asked for. */
const keyOf = ({ name, lang, set, collector }: LocalizedQuery) => [nameKey(name), lang, set ?? '', collector ?? ''].join('|')

/** @returns The images of a query: undefined until looked up, null if none is scanned in its language. */
export function localizedImage(query: LocalizedQuery): LocalizedImage | null | undefined {
  return images.get(keyOf(query))
}

/** Looks a query up, once per session. */
export function requestLocalizedImage(query: LocalizedQuery): void {
  const key = keyOf(query)
  if (images.has(key) || loading.has(key)) return
  loading.add(key)
  window.api
    .getLocalizedImage(query)
    .catch(() => null)
    .then((image) => {
      loading.delete(key)
      images.set(key, image)
      version++
      for (const listener of listeners) listener()
    })
}

/** Re-renders the caller when an answer arrives. */
export function useLocalizedImagesVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version
  )
}
