import { createHash } from 'node:crypto'
import type { BracketTags, SpellbookCombo } from '@shared/brackets'
import { nameKey } from '@shared/decklist'
import { ui } from '@shared/text'
import { cachedFetch, pruneCacheFolder } from './cacheFiles'
import { env } from './environment'
import { fetchJson } from './http'
import { searchNameKeys } from './scryfall'

/**
 * What the Bracket section needs from services, each cached under `brackets/` in userData:
 * - Scryfall's community tags for mass land denial and extra turns (a week).
 * - EDHREC's salt survey, its saltier cards (a week).
 * - Commander Spellbook's combos in a Deck (a day per card set).
 * Each answer stands alone: one service down leaves the others' facts.
 *
 * @packageDocumentation
 */

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/** Scryfall's tag searches, Commander-legal cards only. */
const TAG_QUERIES = {
  landDenial: 'otag:mass-land-denial f:commander',
  extraTurns: 'otag:extra-turn f:commander'
} as const

/** Commander Spellbook's answers, one file a card set: each edit to a Deck makes another. */
const COMBOS_FOLDER = 'brackets/combos-v1'
/** Card sets whose combos are kept, the most recent. */
const COMBOS_KEPT = 100

/** Salt below this isn't read: the survey's long tail of cards nobody minds. */
const SALT_FLOOR = 0.5
/** Most salt pages read: 100 cards each. */
const SALT_PAGES = 40
/** Salt pages asked for at once. */
const SALT_BATCH = 4

/** @returns The nameKeys a tag search finds; null when Scryfall can't be reached and nothing is cached. */
async function tagged(field: keyof typeof TAG_QUERIES): Promise<string[] | null> {
  try {
    return await cachedFetch(`brackets/tags-v1/${field}.json`, WEEK_MS, () => searchNameKeys(TAG_QUERIES[field]))
  } catch {
    return null
  }
}

/** @returns The cards of one page of EDHREC's salt list, which nests them in one of two places. */
export function saltPage(data: any): { cards: { name: string; salt: number }[]; more: boolean } {
  const views = data?.cardviews ?? data?.container?.json_dict?.cardlists?.[0]?.cardviews
  const cards = Array.isArray(views)
    ? views.flatMap((view: any) => (typeof view?.name === 'string' && typeof view?.salt === 'number' ? [{ name: view.name, salt: view.salt }] : []))
    : []
  const more = !!(data?.more ?? data?.container?.json_dict?.cardlists?.[0]?.more)
  return { cards, more }
}

/**
 * @returns One page of the salt list; null when a later page fails, which ends the list there.
 * @throws Error when the first page fails: there is no list.
 */
async function saltPageAt(page: number): Promise<ReturnType<typeof saltPage> | null> {
  try {
    const response = await fetchJson(`${env().edhrecTop}/${page === 0 ? 'salt' : `salt-${page}`}.json`, 'EDHREC')
    if (response.status !== 200) throw new Error(ui.errors.edhrec(response.status))
    return saltPage(response.data)
  } catch (error) {
    if (page === 0) throw error
    return null
  }
}

/** @returns Salt by nameKey, down to {@link SALT_FLOOR}, rounded to hundredths; a few pages at a time. */
async function fetchSalt(): Promise<Record<string, number>> {
  const salt: Record<string, number> = {}
  for (let first = 0; first < SALT_PAGES; first += SALT_BATCH) {
    const count = Math.min(SALT_BATCH, SALT_PAGES - first)
    const pages = await Promise.all(Array.from({ length: count }, (_, i) => saltPageAt(first + i)))
    for (const page of pages) {
      if (!page) return salt
      for (const card of page.cards) if (salt[nameKey(card.name)] === undefined) salt[nameKey(card.name)] = Math.round(card.salt * 100) / 100
      if (!page.more || page.cards.length === 0 || page.cards[page.cards.length - 1].salt < SALT_FLOOR) return salt
    }
  }
  return salt
}

/** @returns Scryfall's tags per card; a tag Scryfall can't give is null. Never rejects. */
export async function getBracketTags(): Promise<BracketTags> {
  const [landDenial, extraTurns] = await Promise.all([tagged('landDenial'), tagged('extraTurns')])
  return { landDenial, extraTurns }
}

/** @returns EDHREC's salt by nameKey; null when it can't be reached and nothing is cached. Never rejects. */
export function getBracketSalt(): Promise<Record<string, number> | null> {
  return cachedFetch('brackets/salt-v1.json', WEEK_MS, fetchSalt).catch(() => null)
}

/** @returns A Commander Spellbook combo in our terms; null if malformed. */
export function spellbookCombo(classified: any): SpellbookCombo | null {
  const combo = classified?.combo
  if (typeof combo?.id !== 'string' || !Array.isArray(combo.uses)) return null
  const pieces = combo.uses.flatMap((use: any) =>
    typeof use?.card?.name === 'string'
      ? [{ name: use.card.name, onBattlefield: Array.isArray(use.zoneLocations) && use.zoneLocations.length === 1 && use.zoneLocations[0] === 'B' }]
      : []
  )
  const features: { name: string; status: string }[] = (Array.isArray(combo.produces) ? combo.produces : []).flatMap((one: any) =>
    typeof one?.feature?.name === 'string' ? [{ name: one.feature.name, status: one.feature.status }] : []
  )
  // Standalone results first: what the combo does on its own.
  const results = [...features.filter((one) => one.status === 'S'), ...features.filter((one) => one.status !== 'S')].map((one) => one.name)
  return {
    id: combo.id,
    pieces,
    manaNeeded: Number(combo.manaValueNeeded) || 0,
    results: results.slice(0, 2),
    // Two cards, though a prerequisite may make Commander Spellbook call it arguable: Sanguine Bond and Exquisite Blood.
    twoCard: classified.definitelyTwoCard === true || classified.arguablyTwoCard === true,
    gameEnding: [classified.relevant, classified.lock, classified.skipTurns, classified.controlAllOpponents].some((flag) => flag === true),
    extraTurns: classified.extraTurn === true,
    landDenial: classified.massLandDenial === true
  }
}

/**
 * @param commanders - The Deck's commanders: free combo pieces.
 * @param cards - Its other cards.
 * @returns The combos Commander Spellbook finds in a Deck; null when it can't be reached and
 * nothing is cached. Never rejects.
 */
export async function getBracketCombos(commanders: string[], cards: string[]): Promise<SpellbookCombo[] | null> {
  const key = createHash('sha1')
    .update(JSON.stringify([[...commanders].sort(), [...cards].sort()]))
    .digest('hex')
  try {
    return await cachedFetch(`${COMBOS_FOLDER}/${key}.json`, DAY_MS, async () => {
      const body = { commanders: commanders.map((card) => ({ card })), main: cards.map((card) => ({ card })) }
      const response = await fetchJson(`${env().spellbookApi}/estimate-bracket/`, 'Commander Spellbook', body)
      if (response.status !== 200 || !Array.isArray(response.data?.combos)) throw new Error(ui.errors.http('Commander Spellbook', response.status))
      void pruneCacheFolder(COMBOS_FOLDER, COMBOS_KEPT)
      return (response.data.combos as unknown[]).flatMap((one) => spellbookCombo(one) ?? [])
    })
  } catch {
    return null
  }
}
