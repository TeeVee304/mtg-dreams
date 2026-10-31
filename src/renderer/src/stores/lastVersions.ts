import { nameKey } from '@shared/decklist'
import { languageOf, type Language } from '@shared/languages'

/**
 * The last Version chosen for each Card added to the Inventory, so the "choose version" step opens
 * on it next time; with the last language chosen for any Card, for Cards never added. Kept in
 * localStorage: a convenience, lost with no harm.
 *
 * @packageDocumentation
 */

/** A chosen Version: printing (none for Any Version), finish and language (none for English). */
export interface ChosenVersion {
  set?: string
  collector?: string
  foil: boolean
  lang?: Language
}

/** What is remembered. */
export interface VersionMemory {
  /** Last Version by nameKey, oldest first. */
  cards: Record<string, ChosenVersion>
  /** Last language chosen for any Card; none for English. */
  lang?: Language
}

/** localStorage key. */
const KEY = 'mtg-dreams.lastVersions'
/** Cards remembered; the oldest are forgotten first. */
export const MAX_REMEMBERED = 2000

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** @returns A stored Version; null if invalid. */
function validVersion(raw: unknown): ChosenVersion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { set, collector, foil, lang } = raw as Record<string, unknown>
  if (typeof foil !== 'boolean') return null
  const version: ChosenVersion = { foil }
  if (text(set)) {
    version.set = text(set)
    if (text(collector)) version.collector = text(collector)
  }
  const language = languageOf(text(lang))
  if (language) version.lang = language
  return version
}

/** @returns The memory in stored JSON, without invalid entries; empty if unreadable. */
export function parseMemory(raw: string | null): VersionMemory {
  try {
    const stored = JSON.parse(raw ?? 'null') as { cards?: unknown; lang?: unknown } | null
    const cards: Record<string, ChosenVersion> = {}
    if (stored?.cards && typeof stored.cards === 'object') {
      for (const [key, value] of Object.entries(stored.cards)) {
        const version = validVersion(value)
        if (version) cards[key] = version
      }
    }
    const lang = languageOf(text(stored?.lang))
    return lang ? { cards, lang } : { cards }
  } catch {
    return { cards: {} }
  }
}

/** @returns `memory` with `version` as the last for `name`, the oldest Cards forgotten past {@link MAX_REMEMBERED}. */
export function withRemembered(memory: VersionMemory, name: string, version: ChosenVersion): VersionMemory {
  const key = nameKey(name)
  const entries = Object.entries(memory.cards).filter(([other]) => other !== key)
  entries.push([key, validVersion(version)!])
  const cards = Object.fromEntries(entries.slice(-MAX_REMEMBERED))
  return version.lang ? { cards, lang: version.lang } : { cards }
}

/** @returns The Version to start from for `name` in `memory`: its last, else Any Version in the last language. */
export function startingVersion(memory: VersionMemory, name: string): ChosenVersion {
  return memory.cards[nameKey(name)] ?? (memory.lang ? { foil: false, lang: memory.lang } : { foil: false })
}

/** @returns The stored memory; empty if storage is unavailable. */
function load(): VersionMemory {
  try {
    return parseMemory(localStorage.getItem(KEY))
  } catch {
    return { cards: {} }
  }
}

/** @returns The Version the "choose version" step starts from for `name`. */
export const lastVersion = (name: string): ChosenVersion => startingVersion(load(), name)

/** Remembers `version` as the last chosen for `name`. Storage errors are ignored. */
export function rememberVersion(name: string, version: ChosenVersion): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(withRemembered(load(), name, version)))
  } catch {}
}
