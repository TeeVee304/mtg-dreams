import { BRACKETS, engineChoice, interactionOf, INTERACTIONS, STRATEGIES, winconChoice } from './deckBrief'
import { nameKey } from '../decklist'
import { DECK_CARDS, slotInfo, type Slot, type SlotId } from './deckTemplate'
import { communityScore, fitSignal, isLand, rarestLink, slotScore, type CandidatePool, type PoolCard } from './deckPool'
import { BASIC_LANDS, basicSplit, colorPips, landColors } from './manaBase'
import { MECHANICS, mechanicName, type MechanicId } from './mechanics'
import { explainLink } from './synergy'

/**
 * A first draft of the 99, built by code alone: key cards and pets first, then each slot of the
 * plan from its best candidates, within the budget, then basic lands split by color. It is the
 * starting point and fallback; picks made elsewhere are checked by `checkDeck` the same way.
 *
 * @packageDocumentation
 */

/** A card in the deck. */
export interface DeckPick {
  name: string
  /** Copies; more than one only for basic lands. */
  qty: number
  /** The job it does in the deck. */
  slot: SlotId
  /** Why it is in the deck, in plain words. */
  reason: string
}

/** The drafted deck. */
export interface Draft {
  picks: DeckPick[]
  /** Slots that got fewer cards than planned, as the pool or budget ran out; other slots or basic lands took their place. */
  short: Array<{ slot: SlotId; missing: number }>
}

/** A card may cost at most this many times the money left per card still to pick. */
const SPREAD = 8

/** "R, G or U" from color letters. */
const colorList = (colors: string[]) => (colors.length < 2 ? colors.join('') : `${colors.slice(0, -1).join(', ')} or ${colors.at(-1)}`)

/** @returns Why a card is in a slot: what it does for the job, quoting its rules text, and how it connects. */
export function pickReason(entry: PoolCard, slot: Slot, pool: CandidatePool): string {
  const reason = ownReason(entry, slot, pool)
  const played = communityReason(entry, slot, pool)
  return played ? `${reason} ${played}` : reason
}

/** Least staple rate worth telling the player about. */
const TOLD_STAPLE = 0.3
/** Least theme rate worth telling the player about. */
const TOLD_THEME = 0.1

/** What decks built by people say about a card, in plain words; null if nothing worth saying. */
function communityReason(entry: PoolCard, slot: Slot, pool: CandidatePool): string | null {
  const found = communityScore(pool, entry.card)
  if (!found) return null
  const own = pool.community?.own
  if (found.own && own) return `${pool.focus[0].name}'s own precon, ${own.name}, plays it.`
  const plan = slot.id === 'theme' || !!slot.wincon || !!slot.engine
  if (plan && found.themeId && found.theme >= TOLD_THEME) return `Precons built around ${mechanicName(found.themeId)} play it often.`
  if (found.staple >= TOLD_STAPLE) return `A staple: in ${Math.round(found.staple * 100)}% of precons that can play it.`
  return null
}

/** Why a card fits its slot, from its rules text and connections. */
function ownReason(entry: PoolCard, slot: Slot, pool: CandidatePool): string {
  const name = entry.card.name
  const link = entry.links[0] && explainLink(name, entry.links[0])
  if (slot.id === 'wildcard') {
    const rare = rarestLink(pool, entry)
    return `Wildcard: ${rare ? explainLink(name, rare) : link}`
  }
  if (slot.id === 'theme') return link ?? 'Fills out the deck.'
  if (slot.id === 'land') {
    const colors = [...landColors(entry.card)].filter((color) => pool.identity.includes(color))
    return link ?? `Makes ${colorList(colors)} mana.`
  }
  const found = fitSignal(slot, entry.profile)
  const does = found ? `${slot.label}: “${found.evidence}”` : slot.label
  return link ? `${does} ${link}` : does
}

/** Basic land type mechanic of a color: `R` → `type-mountain`. */
const typeOf = (color: string) => `type-${BASIC_LANDS[color].toLowerCase()}` as MechanicId

/**
 * Splits `count` basic lands by the colored symbols of the deck's spells, favoring land types a
 * key card counts.
 */
export function basicPicks(count: number, spells: PoolCard[], pool: CandidatePool): DeckPick[] {
  const pips: Record<string, number> = {}
  for (const { card } of spells) {
    for (const [color, n] of Object.entries(colorPips(card.manaCost))) pips[color] = (pips[color] ?? 0) + n
  }
  const counted: Record<string, number> = {}
  const countedBy: Record<string, string> = {}
  for (const color of pool.identity) {
    for (const { name, profile } of pool.focus) {
      const use = profile.uses.find((s) => s.id === typeOf(color))
      if (use && use.weight > (counted[color] ?? 0)) [counted[color], countedBy[color]] = [use.weight, `${name} ${MECHANICS[use.id].use}`]
    }
  }
  return basicSplit(count, pool.identity, pips, counted).map(({ name, qty }) => {
    const color = pool.identity.find((c) => BASIC_LANDS[c] === name)
    const why = color && countedBy[color] ? `${countedBy[color]}, so more of the basics are ${MECHANICS[typeOf(color)].label}.` : 'Matches the colors of your spells.'
    return { name, qty, slot: 'land' as const, reason: `Basic land. ${why}` }
  })
}

/**
 * Drafts the 99 from a pool.
 * @returns Picks in picking order, basic lands last.
 */
export function draftDeck(pool: CandidatePool): Draft {
  const { brief, template } = pool
  const picks: DeckPick[] = []
  const chosen: PoolCard[] = []
  const taken = new Set<string>([pool.commander, ...pool.anchors].map((e) => nameKey(e.card.name)))
  const filled = new Map<SlotId, number>()
  const budget = brief.budget.total
  let spent = pool.commander.price ?? 0

  /** Money still free if `cards` more are bought at the cheap price. */
  const free = (cards: number) => (budget === null ? Infinity : budget - spent - cards * pool.cheapPrice)
  /** Leaves money for the rest; unless `wanted`, also no more than a fair share, so early slots can't use up the budget. */
  const affordable = (price: number | null, wanted = false) => {
    const left = DECK_CARDS - chosen.length
    const cost = price ?? 0
    return cost <= free(left - 1) && (wanted || cost <= (free(0) / left) * SPREAD)
  }
  const place = (entry: PoolCard, slot: SlotId, reason: string) => {
    picks.push({ name: entry.card.name, qty: 1, slot, reason })
    chosen.push(entry)
    taken.add(nameKey(entry.card.name))
    filled.set(slot, (filled.get(slot) ?? 0) + 1)
    spent += entry.price ?? 0
  }
  /** First slot in picking order the card fits and that has room; else lands or the theme. */
  const bestSlot = (entry: PoolCard): Slot =>
    template.slots.find(
      (slot) => slot.id !== 'theme' && slot.id !== 'wildcard' && (filled.get(slot.id) ?? 0) < slot.count && slotScore(slot, entry, pool) !== null
    ) ?? template.slots.find((slot) => slot.id === (isLand(entry.card) ? 'land' : 'theme'))!

  for (const anchor of pool.anchors) {
    const slot = bestSlot(anchor)
    place(anchor, slot.id, `Your key card. ${pickReason(anchor, slot, pool)}`)
  }
  for (const name of brief.locks) {
    const lock = pool.eligible.get(nameKey(name))
    if (!lock || taken.has(nameKey(name))) continue
    const slot = bestSlot(lock)
    place(lock, slot.id, `You locked it in. ${pickReason(lock, slot, pool)}`)
  }
  for (const name of brief.pets) {
    const pet = pool.eligible.get(nameKey(name))
    if (!pet || taken.has(nameKey(name)) || !affordable(pet.price, true)) continue
    const slot = bestSlot(pet)
    place(pet, slot.id, `One of your pet cards. ${pickReason(pet, slot, pool)}`)
  }

  for (const { slot, ranked } of pool.groups) {
    // Nonbasic lands up to their share; basic lands come last.
    const target = slot.id === 'land' ? Math.min(slot.nonbasic ?? 0, slot.count) : slot.count
    // A card that works against the key cards more than it helps is never worth its slot.
    for (const { entry, score } of ranked) {
      if ((filled.get(slot.id) ?? 0) >= target || score <= 0) break
      if (!taken.has(nameKey(entry.card.name)) && affordable(entry.price)) place(entry, slot.id, pickReason(entry, slot, pool))
    }
  }

  // Slots left short: the best remaining cards for the theme, then for any other job.
  const theme = template.slots.find((slot) => slot.id === 'theme')!
  const spellsWanted = template.slots.reduce((sum, slot) => sum + (slot.id === 'land' ? 0 : slot.count), 0)
  let spells = picks.filter((pick) => pick.slot !== 'land').length
  const leftovers = [...pool.groups.filter((g) => g.slot.id === 'theme'), ...pool.groups.filter((g) => g.slot.id !== 'theme' && g.slot.id !== 'land')]
  for (const { entry, score } of leftovers.flatMap((group) => group.ranked)) {
    if (spells >= spellsWanted) break
    if (score <= 0 || taken.has(nameKey(entry.card.name)) || !affordable(entry.price)) continue
    place(entry, 'theme', pickReason(entry, theme, pool))
    spells++
  }

  // Basic lands fill the rest of the land slot, and any spell slots nothing could fill.
  const spellCards = [pool.commander, ...chosen].filter((entry) => !isLand(entry.card))
  picks.push(...basicPicks(DECK_CARDS - chosen.length, spellCards, pool))

  const short = template.slots
    .filter((slot) => slot.id !== 'land')
    .map((slot) => ({ slot: slot.id, missing: slot.count - (filled.get(slot.id) ?? 0) }))
    .filter((gap) => gap.missing > 0)
  return { picks, short }
}

/** "Flubs" from "Flubs, the Fool". */
const shortName = (name: string) => name.split(/,| \/\/ /)[0]

/** How a drafted deck plays, in plain words, from its brief. */
export function draftSummary(pool: CandidatePool): string {
  const { brief } = pool
  const lead = shortName(brief.commander)
  const engines = brief.engines.map((engine) => engineChoice(engine).label)
  const wincons = brief.wincons.map((wincon) => winconChoice(wincon).label)
  const strategy = brief.strategy && STRATEGIES[brief.strategy]
  const interaction = INTERACTIONS[interactionOf(brief)]
  return [
    `A Bracket ${brief.bracket} · ${BRACKETS[brief.bracket].label} ${strategy ? `${strategy.label} ` : ''}deck led by ${lead}.`,
    engines.length > 0
      ? `It does more of what ${lead} does best, ${engines.join(' and ')}, with cards that do it too and cards that reward it.`
      : `It is built around ${lead}, with cards that connect to it.`,
    wincons.length > 0 ? `It wins with ${wincons.join(' or ')}.` : `It wins by playing to ${lead}’s strengths.`,
    `${strategy ? `${strategy.explain} ` : ''}${interaction.label} interaction: ${interaction.plain?.toLowerCase()}.`,
    'MTG Dreams picked every card from its rules text and how widely it’s played: swap any card you don’t like.'
  ].join(' ')
}

/** Notes on a drafted deck: the parts of the plan it couldn't fill. */
export function draftNotes(draft: Draft): string[] {
  return draft.short.map(({ slot, missing }) => {
    const { label } = slotInfo(slot)
    return `Not enough cards for “${label}” fit your budget, so ${missing} other card${missing === 1 ? '' : 's'} took ${missing === 1 ? 'its' : 'their'} place.`
  })
}

/**
 * The next-best card for a pick's job: the best-ranked card for its slot that isn't in the deck,
 * isn't in `skip`, and costs at most `maxPrice`.
 * @returns The card and why, in the pick's slot; undefined if none is left.
 */
export function nextBest(
  pool: CandidatePool,
  pick: Pick<DeckPick, 'name' | 'slot'>,
  inDeck: string[],
  skip: string[],
  maxPrice: number | null
): DeckPick | undefined {
  const group = pool.groups.find((g) => g.slot.id === pick.slot) ?? pool.groups.find((g) => g.slot.id === 'theme')!
  const out = new Set([...inDeck, ...skip, pick.name].map(nameKey))
  for (const { entry, score } of group.ranked) {
    if (score <= 0) break
    if (out.has(nameKey(entry.card.name)) || (maxPrice !== null && (entry.price ?? 0) > maxPrice)) continue
    return { name: entry.card.name, qty: 1, slot: group.slot.id, reason: pickReason(entry, group.slot, pool) }
  }
  return undefined
}
