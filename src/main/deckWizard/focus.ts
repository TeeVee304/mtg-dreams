import { isBasicLand } from '@shared/cards'
import type { CardHit, CardTrait, DeckFocusInfo, FocusCardInfo } from '@shared/deckWizard/api'
import { engineOptions, winconOptions, type DeckBrief, type WinconOption } from '@shared/deckWizard/deckBrief'
import type { LibraryCard } from '@shared/deckWizard/libraryCard'
import { readCard } from '@shared/deckWizard/mechanics'
import { mechanicName, MECHANICS, ROLES, type CardProfile, type MechanicId, type RoleId, type Signal } from '@shared/deckWizard/vocabulary'
import { conflictsWith, explainConflict, explainLink, linksTo, type FocusCard } from '@shared/deckWizard/synergy'
import { canLead, commanderRule, findFormat } from '@shared/formats'
import type { PriceBasis } from '@shared/types'
import { loadPriceGuide } from '../priceGuide'
import { cardLibraryStatus, cheapestPrice, ensureCardLibrary, libraryCard, libraryCards, loadCardLibrary } from './cardLibrary'

/**
 * The cards a deck starts from: finding commanders and key cards by name, checking they can lead
 * or join the deck, and saying what each does in plain words.
 *
 * @packageDocumentation
 */

/** A library card with what it does. */
export interface KnownCard {
  card: LibraryCard
  profile: CardProfile
}

const COMMANDER = findFormat('commander')!

/** @returns The library card and what it does; undefined if unknown. */
export function known(name: string): KnownCard | undefined {
  const card = libraryCard(name)
  return card && { card, profile: readCard(card) }
}

/**
 * The commander and key cards of a brief, from the card library (downloaded on first use).
 * @returns The commander, then the key cards.
 * @throws Error in plain words when a card is unknown, can't lead, isn't allowed in Commander, or
 * is outside the commander's colors.
 */
export async function deckFocus(brief: Pick<DeckBrief, 'commander' | 'anchors'>): Promise<KnownCard[]> {
  await ensureCardLibrary()
  const commander = known(brief.commander)
  if (!commander) throw new Error(`“${brief.commander}” isn't a card MTG Dreams knows.`)
  const lead = commander.card
  if (!canLead(COMMANDER, lead)) throw new Error(`${lead.name} can't be your commander: it must be ${commanderRule(COMMANDER)}.`)
  if (lead.legalities.commander !== 'legal') throw new Error(`${lead.name} isn't allowed in Commander.`)
  const anchors = brief.anchors.map((name) => {
    const anchor = known(name)
    if (!anchor) throw new Error(`“${name}” isn't a card MTG Dreams knows.`)
    if (anchor.card.legalities.commander !== 'legal') throw new Error(`${anchor.card.name} isn't allowed in Commander.`)
    if (!anchor.card.colorIdentity.every((color) => lead.colorIdentity.includes(color))) {
      throw new Error(`${anchor.card.name} is outside ${lead.name}'s colors.`)
    }
    return anchor
  })
  return [commander, ...anchors]
}

/** @returns Ways to win for the brief's commander and key cards, those they point to first. */
export async function deckWincons(brief: Pick<DeckBrief, 'commander' | 'anchors'>): Promise<WinconOption[]> {
  const focus = await deckFocus(brief)
  return winconOptions(focus.map(({ card, profile }) => ({ name: card.name, profile })))
}

/** A mechanic as a trait: its community name, with the plain label alongside. */
const mechanicTrait = (id: MechanicId): CardTrait => {
  const { label, explain } = MECHANICS[id]
  const name = mechanicName(id)
  return { label: name, ...(name !== label && { plain: label }), explain }
}
/** A role as a trait. */
const roleTrait = (id: RoleId): CardTrait => {
  const { label, plain, explain } = ROLES[id]
  return { label, ...(plain && { plain }), explain }
}

/** Strongest signals of one side of a profile, as traits. */
function traits<T extends string>(signals: Array<Signal<T>>, trait: (id: T) => CardTrait, min: number, skip: T[] = []): CardTrait[] {
  return signals
    .filter((s) => s.weight >= min && !s.via && !skip.includes(s.id))
    .sort((a, b) => b.weight - a.weight)
    .map((s) => trait(s.id))
}

/** A card found by search, priced on `basis`. */
const hit = (card: LibraryCard, basis: PriceBasis): CardHit => ({
  name: card.name,
  manaCost: card.manaCost,
  typeLine: card.typeLine,
  colorIdentity: card.colorIdentity,
  price: cheapestPrice(card, basis)
})

/** What a card does in plain words: what it makes happen, what it wants, and its deck jobs. */
function describe({ card, profile }: KnownCard, basis: PriceBasis): FocusCardInfo {
  return {
    ...hit(card, basis),
    provides: traits(profile.provides, mechanicTrait, 0.8),
    needs: traits(profile.uses, mechanicTrait, 0.5),
    jobs: traits(profile.roles, roleTrait, 0.8, ['land'])
  }
}

/**
 * The commander and key cards in plain words: what each does and needs, how each key card
 * connects to the commander and the other key cards, and the ways to win they suggest.
 * @throws Error in plain words as {@link deckFocus}.
 */
export async function deckFocusInfo(commander: string, anchors: string[], basis: PriceBasis): Promise<DeckFocusInfo> {
  const [focus] = await Promise.all([deckFocus({ commander, anchors }), loadPriceGuide()])
  const cards = focus.map(({ card, profile }) => ({ name: card.name, profile }))
  return {
    commander: describe(focus[0], basis),
    anchors: focus.slice(1).map((anchor) => {
      const others = cards.filter((f) => f.name !== anchor.card.name)
      return {
        ...describe(anchor, basis),
        links: [
          ...sharedEngines(anchor.card.name, anchor.profile, others),
          ...linksTo(anchor.profile, others).map((link) => explainLink(anchor.card.name, link))
        ],
        conflicts: conflictsWith(anchor.profile, others).map((conflict) => explainConflict(anchor.card.name, conflict))
      }
    }),
    wincons: winconOptions(cards),
    engines: engineOptions(cards)
  }
}

/** Strongest a card must do something for it to be an engine it shares. */
const SHARED_STRENGTH = 0.8

/** "Like Toph, Avatar Kyoshi turns your lands into creatures.": what a card does as strongly as another focus card. */
function sharedEngines(name: string, profile: CardProfile, others: FocusCard[]): string[] {
  const strong = (signals: CardProfile['provides']) => signals.filter((s) => s.weight >= SHARED_STRENGTH && !s.via)
  return strong(profile.provides).flatMap((signal) => {
    const alike = others.find((other) => strong(other.profile.provides).some((s) => s.id === signal.id))
    return alike ? [`Like ${alike.name}, ${name} ${MECHANICS[signal.id].provide}.`] : []
  })
}

/** Most search results. */
const MAX_HITS = 12

/**
 * Searches the card library by name: every word must appear; names starting with the query come
 * first, then names with a word starting with it.
 * @param options - `commanders`: only cards that can lead in Commander; `commander`: only cards its
 * deck may play (legal, in its colors, not basic lands, not itself).
 * @throws Error while the card library isn't downloaded.
 */
export async function searchDeckCards(
  query: string,
  options: { commander?: string; commanders?: boolean; basis: PriceBasis }
): Promise<CardHit[]> {
  await Promise.all([loadCardLibrary(), loadPriceGuide()])
  if (cardLibraryStatus().state !== 'ready') throw new Error('The card library is still downloading.')
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lead = options.commander ? libraryCard(options.commander) : undefined
  const fits = (card: LibraryCard) => {
    if (card.legalities.commander !== 'legal') return false
    if (options.commanders) return canLead(COMMANDER, card)
    if (!lead) return true
    return card !== lead && !isBasicLand(card.name) && card.colorIdentity.every((color) => lead.colorIdentity.includes(color))
  }
  const query0 = words.join(' ')
  const rank = (name: string) => (name.startsWith(query0) ? 0 : name.includes(` ${words[0]}`) ? 1 : 2)
  const found: Array<{ card: LibraryCard; rank: number }> = []
  for (const card of libraryCards()) {
    const name = card.name.toLowerCase()
    if (words.every((word) => name.includes(word)) && fits(card)) found.push({ card, rank: rank(name) })
  }
  found.sort((a, b) => a.rank - b.rank || a.card.name.length - b.card.name.length || a.card.name.localeCompare(b.card.name))
  return found.slice(0, MAX_HITS).map(({ card }) => hit(card, options.basis))
}
