import { frontTypeWords, isBasicLand } from './cards'
import { nameKey } from './decklist'
import type { DeckBrief, WinRoute } from './deckBrief'
import type { DeckTemplate, Slot } from './deckTemplate'
import { BASIC_LANDS, landColors } from './manaBase'
import { ROLES, type CardProfile, type MechanicId, type RoleId, type Signal } from './mechanics'
import { conflictsWith, linksTo, scoreLinks, type Conflict, type FocusCard, type Link } from './synergy'
import type { LibraryCard } from './types'

/**
 * The candidate pool: every card the deck may play, ranked for each slot of the plan. A card's
 * score for a slot is how well it does that job, plus how strongly it connects to the commander
 * and key cards, adjusted to the player's taste. Ranking per slot, not overall, keeps a deck from
 * filling up with whatever connects most while nothing removes threats.
 *
 * @packageDocumentation
 */

/** A card the deck could play, with what connects it to the key cards. */
export interface PoolCard {
  card: LibraryCard
  profile: CardProfile
  /** EUR on the brief's price basis; null if Cardmarket has no price. */
  price: number | null
  links: Link[]
  conflicts: Conflict[]
  /** Connection strength to the key cards, from {@link scoreLinks}. */
  synergy: number
}

/** A card's score for one slot. */
export interface Ranked {
  entry: PoolCard
  score: number
}

/** Every card that fits a slot, best first. */
export interface PoolGroup {
  slot: Slot
  ranked: Ranked[]
}

/** Cards for building a deck from a brief. */
export interface CandidatePool {
  brief: DeckBrief
  template: DeckTemplate
  identity: string[]
  /** The commander, then the key cards. */
  focus: FocusCard[]
  commander: PoolCard
  anchors: PoolCard[]
  /** Basic lands of the deck's colors. */
  basics: PoolCard[]
  /**
   * Cards the deck may play, by name key: legal, in the commander's colors, priced within the
   * per-card limit, and not left out by the player. Basic lands and key cards aside.
   */
  eligible: Map<string, PoolCard>
  /** Each slot of the template with the cards that fit it. */
  groups: PoolGroup[]
  /** What a cheap card costs, for keeping money aside while slots are still empty. */
  cheapPrice: number
  /** How many cards were left out, by reason. */
  excluded: { overCap: number; unpriced: number; avoided: number }
  /** Eligible cards per link (focus, mechanic, direction), for telling common links from rare ones. */
  linkCounts: Map<string, number>
}

/** Card data for building a pool. */
export interface PoolInput {
  brief: DeckBrief
  template: DeckTemplate
  /** The commander, then the key cards. */
  focus: Array<{ card: LibraryCard; profile: CardProfile }>
  /** Every card to consider. */
  library: Iterable<{ card: LibraryCard; profile: CardProfile }>
  /** EUR on the brief's price basis; null if unknown. */
  price: (card: LibraryCard) => number | null
}

/** Least role or route strength for a card to count for it. */
export const MIN_FIT = 0.5
/**
 * Share of synergy added to a card's score for a way to win, and for a role: ramp that also feeds
 * the commander beats ramp that doesn't, but a role card is there first to do its job.
 */
const SYNERGY_SHARE = { route: 0.6, role: 0.4 }
/** Score per other job a card does strongly, up to {@link MAX_JOBS}: a landfall payoff that also ramps beats one that doesn't. */
const JOB_BONUS = 0.2
/** Most other jobs counted. */
const MAX_JOBS = 2
/** A role this strong counts as another job. */
const STRONG_ROLE = 0.8
/** Score lost per mana value above the pace's curve top. */
const CURVE_PENALTY = 0.25
/** Score gained by a card that suits the player's board taste. */
const BOARD_BONUS = 0.15
/** Score gained by a pet card. */
const PET_BONUS = 2
/** Score lost per unit of conflict with a key card. */
const CONFLICT_PENALTY = 1.5
/** Roles where a cheaper card is better. */
const CHEAP_ROLES = new Set<RoleId>(['ramp', 'removal', 'counterspell', 'protection'])
/** Score per mana value below 3 for those roles, and lost per mana above. */
const CHEAP_STEP = 0.08
/** Score of a land by how many of the deck's colors it makes (0, 1, 2, 3+). */
const LAND_FIXING = [0, 0.1, 0.5, 0.7]
/** Score lost by a land that always enters tapped. */
const TAPPED_PENALTY = 0.2
/** A land that always enters tapped; "unless" and "If you don't" make it conditional. */
const ALWAYS_TAPPED_RE = /^This (?:land )?enters tapped\.$/im
/** Card types played from outside the deck, never part of the 99. */
const OUTSIDE_TYPES_RE = /\b(?:Attraction|Contraption)\b/
/** Least link strength for a wildcard's rare link. */
const WILDCARD_LINK = 0.8
/** Least score for a nonbasic land to be worth a slot. */
const MIN_LAND = 0.3
/** Least rarity of a link for a wildcard: 1 when only one card has it, 0 when every card does. */
const MIN_RARITY = 0.35
/** Price percentile of eligible cards counted as cheap. */
const CHEAP_PERCENTILE = 0.2

/** Front face is a land. */
export const isLand = (card: LibraryCard) => frontTypeWords(card.typeLine).includes('Land')

/** Strongest signal for `id` on a profile side. */
const signal = <T extends string>(signals: Array<Signal<T>>, id: T) => signals.find((s) => s.id === id)

/**
 * The signal that makes a card serve a way to win: burn for burning the table, payoffs for a
 * mechanic route…
 * @returns undefined if it doesn't serve it.
 */
export function routeSignal(route: WinRoute, profile: CardProfile): Signal<string> | undefined {
  const best = (...found: Array<Signal<string> | undefined>) =>
    found.filter((s): s is Signal<string> => !!s).sort((a, b) => b.weight - a.weight)[0]
  switch (route) {
    case 'burn':
      return signal(profile.roles, 'burn')
    case 'combat':
      return best(signal(profile.roles, 'evasion'), signal(profile.uses, 'attacking'))
    case 'go-wide':
      return best(signal(profile.provides, 'creature-tokens'), signal(profile.uses, 'creature-tokens'))
    case 'value':
      return signal(profile.roles, 'card-advantage')
    default:
      return signal(profile.uses, route as MechanicId)
  }
}

/** @returns The signal that makes a card fit a role or route slot; undefined for other slots or no fit. */
export function fitSignal(slot: Slot, profile: CardProfile): Signal<string> | undefined {
  if (slot.route) return routeSignal(slot.route, profile)
  if (slot.role && slot.role !== 'land') return signal(profile.roles, slot.role)
  return undefined
}

/** Link key for counting how common a link is. */
const linkKey = (link: Link) => `${link.focus}|${link.mechanic}|${link.direction}`

/** @returns How rare a link is: 1 if only this card has it, 0 if every connected card does. */
export function linkRarity(pool: Pick<CandidatePool, 'linkCounts'>, link: Link): number {
  const connected = pool.linkCounts.get('') ?? 1
  const count = pool.linkCounts.get(linkKey(link)) ?? 1
  return connected <= 1 ? 0 : Math.log(connected / count) / Math.log(connected)
}

/** @returns The card's least common strong link; undefined if it has no strong link. */
export function rarestLink(pool: Pick<CandidatePool, 'linkCounts'>, entry: PoolCard): Link | undefined {
  let best: Link | undefined
  for (const link of entry.links) {
    if (link.weight >= WILDCARD_LINK && (!best || linkRarity(pool, link) > linkRarity(pool, best))) best = link
  }
  return best
}

/** Name keys of each pool's pet cards. */
const petKeys = new WeakMap<CandidatePool, Set<string>>()

/** Score shared by every slot: pace, board taste, pets and conflicts with the key cards. */
function taste(entry: PoolCard, pool: CandidatePool): number {
  const { card } = entry
  let pets = petKeys.get(pool)
  if (!pets) petKeys.set(pool, (pets = new Set(pool.brief.pets.map(nameKey))))
  let score = pets.has(nameKey(card.name)) ? PET_BONUS : 0
  if (entry.conflicts.length > 0) score -= CONFLICT_PENALTY * entry.conflicts[0].weight
  if (isLand(card)) return score
  const { curveTop } = pool.template
  if (curveTop !== null && card.manaValue > curveTop) score -= CURVE_PENALTY * (card.manaValue - curveTop)
  const creature = frontTypeWords(card.typeLine).includes('Creature')
  if (pool.brief.board === 'creatures' ? creature : pool.brief.board === 'spells' && !creature) score += BOARD_BONUS
  return score
}

/** @returns How well a land suits the deck: its connections and the deck's colors it makes, less tapped entry. */
function landScore(entry: PoolCard, identity: string[]): number {
  const colors = [...landColors(entry.card)].filter((color) => identity.includes(color)).length
  const tapped = ALWAYS_TAPPED_RE.test(entry.card.text) ? TAPPED_PENALTY : 0
  return entry.synergy + LAND_FIXING[Math.min(colors, LAND_FIXING.length - 1)] - tapped
}

/**
 * How well a card does a slot's job, before taste.
 * @returns null if it doesn't fit the slot.
 */
function fit(slot: Slot, entry: PoolCard, pool: CandidatePool): number | null {
  const land = isLand(entry.card)
  if (slot.id === 'land') {
    if (!land) return null
    const score = landScore(entry, pool.identity)
    return score >= MIN_LAND ? score : null
  }
  if (land) return null
  /** Bonus for strong roles besides the one that fits the slot. */
  const jobs = (own?: string) =>
    JOB_BONUS * Math.min(MAX_JOBS, entry.profile.roles.filter((r) => r.id !== own && r.weight >= STRONG_ROLE).length)
  if (slot.id === 'theme') return entry.synergy > 0 ? entry.synergy + jobs() : null
  if (slot.id === 'wildcard') {
    // Connects in at least two ways, one of them through a strong link few other cards have.
    const rare = rarestLink(pool, entry)
    const rarity = rare ? linkRarity(pool, rare) : 0
    if (new Set(entry.links.map((link) => link.mechanic)).size < 2 || rarity < MIN_RARITY) return null
    return entry.synergy * (0.5 + rarity)
  }
  const found = fitSignal(slot, entry.profile)
  if (!found || found.weight < MIN_FIT) return null
  let score = found.weight + SYNERGY_SHARE[slot.route ? 'route' : 'role'] * entry.synergy + jobs(found.id)
  if (slot.role && CHEAP_ROLES.has(slot.role)) score += CHEAP_STEP * Math.max(-3, Math.min(3, 3 - entry.card.manaValue))
  return score
}

/**
 * A card's score for a slot: how well it does the job, its connections, and the player's taste.
 * Works for key cards and pets too, which the pool's rankings leave out or rank as usual.
 * @returns null if it doesn't fit the slot.
 */
export function slotScore(slot: Slot, entry: PoolCard, pool: CandidatePool): number | null {
  const score = fit(slot, entry, pool)
  return score === null ? null : score + taste(entry, pool)
}

/** Price of the cheapest `share` of cards. */
function percentile(prices: number[], share: number): number {
  if (prices.length === 0) return 0
  const sorted = [...prices].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]
}

/** Basic land names a deck of these colors uses. */
const basicNames = (identity: string[]) =>
  new Set((identity.length === 0 ? ['C'] : identity).map((color) => BASIC_LANDS[color]).filter(Boolean).map(nameKey))

/** Why a card can't be picked: `basic` lands are added automatically, the rest are left out. */
export interface Exclusion {
  kind: 'focus' | 'illegal' | 'outside' | 'colors' | 'basic' | 'avoided' | 'unpriced' | 'over-cap'
  /** In plain words, e.g. "Taiga costs €210.00, over the €20.00 limit per card." */
  message: string
}

/** "€12.50". */
const eur = (value: number) => `€${value.toFixed(2)}`

/**
 * Whether a card may be picked for the deck: not the commander or a key card, legal in Commander,
 * part of the 99, in the commander's colors, not a basic land, not left out by the player, and
 * priced within the per-card limit (any price while there is no budget).
 * @param price - The card's price on the brief's basis; null if unknown.
 * @returns Why not; null if it may.
 */
export function exclusion(
  card: LibraryCard,
  profile: CardProfile,
  price: number | null,
  pool: Pick<CandidatePool, 'brief' | 'identity' | 'focus'>
): Exclusion | null {
  const { brief } = pool
  const key = nameKey(card.name)
  const commander = pool.focus[0].name
  if (pool.focus.some((f) => nameKey(f.name) === key)) {
    const role = nameKey(commander) === key ? 'your commander' : 'one of your key cards'
    return { kind: 'focus', message: `${card.name} is already in the deck as ${role}.` }
  }
  const legality = card.legalities.commander
  if (legality !== 'legal') {
    return { kind: 'illegal', message: `${card.name} ${legality === 'banned' ? 'is banned' : "isn't allowed"} in Commander.` }
  }
  if (OUTSIDE_TYPES_RE.test(card.typeLine)) return { kind: 'outside', message: `${card.name} is played from outside the deck, not as one of the 99.` }
  if (!card.colorIdentity.every((color) => pool.identity.includes(color))) {
    return { kind: 'colors', message: `${card.name} is outside ${commander}'s colors.` }
  }
  if (isBasicLand(card.name)) return { kind: 'basic', message: `Basic lands like ${card.name} are added automatically.` }
  const pet = brief.pets.some((name) => nameKey(name) === key)
  if (brief.avoid.some((name) => nameKey(name) === key)) return { kind: 'avoided', message: `The player asked to leave out ${card.name}.` }
  const avoidedRole = pet ? undefined : profile.roles.find((r) => brief.avoidRoles.includes(r.id) && r.weight >= STRONG_ROLE)
  if (avoidedRole) {
    return { kind: 'avoided', message: `The player asked to leave out ${ROLES[avoidedRole.id].label.toLowerCase()} cards, and ${card.name} is one.` }
  }
  const budgeted = brief.budget.total !== null || brief.budget.perCard !== null
  if (price === null && budgeted) return { kind: 'unpriced', message: `${card.name} has no Cardmarket price, so it can't be fitted to the budget.` }
  if (price !== null && brief.budget.perCard !== null && price > brief.budget.perCard) {
    return { kind: 'over-cap', message: `${card.name} costs ${eur(price)}, over the ${eur(brief.budget.perCard)} limit per card.` }
  }
  return null
}

/**
 * Builds the pool: picks the cards the deck may play and ranks them for every slot of the
 * template. Cards the deck may not play (see {@link exclusion}) are left out; those left out by
 * the player or the budget are counted.
 */
export function buildPool(input: PoolInput): CandidatePool {
  const { brief, template, price } = input
  const [commander] = input.focus
  const identity = commander.card.colorIdentity
  const focus: FocusCard[] = input.focus.map(({ card, profile }) => ({ name: card.name, profile }))
  const basics = basicNames(identity)
  const entry = (card: LibraryCard, profile: CardProfile, others: FocusCard[]): PoolCard => {
    const links = linksTo(profile, others)
    return { card, profile, price: price(card), links, conflicts: conflictsWith(profile, others), synergy: scoreLinks(links) }
  }

  const pool: CandidatePool = {
    brief,
    template,
    identity,
    focus,
    commander: entry(commander.card, commander.profile, focus.slice(1)),
    anchors: input.focus.slice(1).map(({ card, profile }) => entry(card, profile, focus.filter((f) => f.name !== card.name))),
    basics: [],
    eligible: new Map(),
    groups: [],
    cheapPrice: 0,
    excluded: { overCap: 0, unpriced: 0, avoided: 0 },
    linkCounts: new Map()
  }

  for (const { card, profile } of input.library) {
    const out = exclusion(card, profile, price(card), pool)
    if (out?.kind === 'basic' && basics.has(nameKey(card.name))) pool.basics.push(entry(card, profile, focus))
    else if (out?.kind === 'avoided') pool.excluded.avoided++
    else if (out?.kind === 'unpriced') pool.excluded.unpriced++
    else if (out?.kind === 'over-cap') pool.excluded.overCap++
    else if (!out) pool.eligible.set(nameKey(card.name), entry(card, profile, focus))
  }

  let connected = 0
  for (const { links } of pool.eligible.values()) {
    if (links.length > 0) connected++
    for (const key of new Set(links.map(linkKey))) pool.linkCounts.set(key, (pool.linkCounts.get(key) ?? 0) + 1)
  }
  pool.linkCounts.set('', connected)
  pool.cheapPrice = percentile(
    [...pool.eligible.values()].map((e) => e.price ?? 0),
    CHEAP_PERCENTILE
  )

  for (const slot of template.slots) {
    const ranked: Ranked[] = []
    for (const candidate of pool.eligible.values()) {
      const score = slotScore(slot, candidate, pool)
      if (score !== null) ranked.push({ entry: candidate, score })
    }
    ranked.sort(
      (a, b) =>
        b.score - a.score || (a.entry.price ?? 0) - (b.entry.price ?? 0) || a.entry.card.name.localeCompare(b.entry.card.name)
    )
    pool.groups.push({ slot, ranked })
  }
  return pool
}

/** Cards offered for a slot: enough to choose from, not the whole library. Ways to win get the widest choice. */
function offerSize(slot: Slot): number {
  if (slot.id === 'land') return Math.round((slot.nonbasic ?? slot.count) * 2.5)
  if (slot.id === 'wildcard') return Math.max(slot.count * 6, 15)
  if (slot.route) return Math.max(slot.count * 5, 15)
  return Math.max(slot.count * 4, slot.count + 10)
}

/**
 * The cards to choose from per slot, best first; each card is offered once, in the first slot
 * it makes, in picking order. Cards tied with the last one offered come too, up to twice the
 * usual number, so equal cards aren't cut off by price.
 */
export function offeredGroups(pool: CandidatePool): PoolGroup[] {
  const offered = new Set<string>()
  return pool.groups
    .filter((group) => group.slot.count > 0)
    .map((group) => {
      const size = offerSize(group.slot)
      const ranked: Ranked[] = []
      for (const item of group.ranked) {
        const tied = ranked.length > 0 && item.score === ranked[ranked.length - 1].score
        if (ranked.length >= size * 2 || (ranked.length >= size && !tied)) break
        const key = nameKey(item.entry.card.name)
        if (offered.has(key)) continue
        offered.add(key)
        ranked.push(item)
      }
      return { slot: group.slot, ranked }
    })
}
