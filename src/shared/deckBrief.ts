import { nameKey } from './decklist'
import { MECHANICS, ROLES, type MechanicId, type RoleId, type Signal } from './mechanics'
import { DEFAULT_PRICE_BASIS, isPriceBasis } from './pricing'
import { providePhrase, type FocusCard } from './synergy'
import type { PriceBasis } from './types'

/**
 * The deck brief: what the player wants from a new Commander deck, gathered by the wizard's
 * questions. Every choice comes in plain words with the jargon players will hear for it, so the
 * wizard teaches while it asks.
 *
 * @packageDocumentation
 */

/** A choice in plain words. */
export interface Choice {
  label: string
  /** One sentence for new players. */
  explain: string
  /** Jargon for it, if any. */
  term?: string
}

/** What matters most to the player. */
const PILLAR_INFO = {
  interaction: {
    label: 'Interaction',
    explain: 'Answering what opponents do: removing their threats and stopping their spells.',
    term: 'interaction'
  },
  evasion: { label: 'Evasion', explain: 'Getting your creatures past blockers, so your attacks land.', term: 'evasion' },
  resources: { label: 'Resources', explain: 'Having more mana and more cards than everyone else.', term: 'ramp and card advantage' },
  'win-condition': { label: 'Win condition', explain: 'Having clear, strong ways to actually end the game.', term: 'win cons' }
} as const satisfies Record<string, Choice>

/** Pillar id. */
export type PillarId = keyof typeof PILLAR_INFO
/** What can matter most, by id. */
export const PILLARS: Record<PillarId, Choice> = PILLAR_INFO

/** General ways to win, whatever the commander. */
const ROUTE_INFO = {
  burn: { label: 'Burn the table', explain: 'Deal damage straight to opponents, no attacking needed.', term: 'burn' },
  combat: { label: 'Attack with creatures', explain: 'Get big or hard-to-block creatures through, turn after turn.', term: 'beatdown' },
  'go-wide': { label: 'Flood the board', explain: 'Make lots of small creatures, then make them all stronger at once.', term: 'go wide' },
  value: { label: 'Out-value the table', explain: 'Get more cards and mana than anyone, and win the long game.', term: 'value' }
} as const satisfies Record<string, Choice>

/** General route id. */
export type RouteId = keyof typeof ROUTE_INFO
/** General ways to win, by id. */
export const ROUTES: Record<RouteId, Choice> = ROUTE_INFO

/** How the deck wins: a general route, or stacking payoffs for a mechanic, e.g. `land-enters` (landfall). */
export type WinRoute = RouteId | MechanicId

/** How fast the deck should come together. */
const PACE_INFO = {
  fast: { label: 'Quick start', explain: 'Cheap cards and fewer lands, so the deck gets going early.', term: 'low curve' },
  steady: { label: 'Steady build', explain: 'A balanced mix of cheap and expensive cards.', term: 'midrange' },
  big: { label: 'Big turns', explain: 'More lands and mana, building up to powerful expensive cards.', term: 'big mana' }
} as const satisfies Record<string, Choice>

/** Pace id. */
export type PaceId = keyof typeof PACE_INFO
/** Paces, by id. */
export const PACES: Record<PaceId, Choice> = PACE_INFO

/** What the player likes to have on the table. */
const BOARD_INFO = {
  creatures: { label: 'Lots of creatures', explain: 'Most of your cards are creatures.', term: 'creature-heavy' },
  mixed: { label: 'A mix', explain: 'Creatures and other cards in about equal measure.' },
  spells: {
    label: 'Mostly other cards',
    explain: 'Enchantments, artifacts, instants and sorceries do most of the work.',
    term: 'noncreature'
  }
} as const satisfies Record<string, Choice>

/** Board id. */
export type BoardId = keyof typeof BOARD_INFO
/** Board styles, by id. */
export const BOARDS: Record<BoardId, Choice> = BOARD_INFO

/** Spending limits, in EUR. */
export interface Budget {
  /** The whole deck, commander included; null for no limit. */
  total: number | null
  /** Most one card may cost; null for no limit. */
  perCard: number | null
  /** Cardmarket price the limits apply to. */
  basis: PriceBasis
}

/** What the player wants from the deck. */
export interface DeckBrief {
  commander: string
  /** Key cards the deck is built around besides the commander, up to {@link MAX_ANCHORS}; always in it. */
  anchors: string[]
  /** What matters most. */
  pillar: PillarId
  /** How the deck wins, up to {@link MAX_ROUTES}; none leaves it to the deck's theme. */
  routes: WinRoute[]
  pace: PaceId
  board: BoardId
  /** Cards the player would love to see in it. */
  pets: string[]
  /** Cards to keep out. */
  avoid: string[]
  /** Kinds of cards to keep out, e.g. counterspells. */
  avoidRoles: RoleId[]
  budget: Budget
  /** Cards picked for surprise, through connections players rarely think of: 0 to {@link MAX_WILDCARDS}. */
  wildcards: number
}

/** Most key cards besides the commander. */
export const MAX_ANCHORS = 3
/** Most win routes. */
export const MAX_ROUTES = 3
/** Most wildcards. */
export const MAX_WILDCARDS = 10
/** Longest card name accepted. */
const MAX_NAME = 200
/** Most pet or avoided cards. */
const MAX_NAMES = 50

/** Mechanics with enough payoff cards to win through. */
const PAYOFF_MECHANICS = new Set<MechanicId>([
  'land-enters', 'land-count', 'land-leaves', 'lands-in-graveyard', 'discard', 'card-draw', 'graveyard', 'spell-cast',
  'instants-sorceries', 'counters', 'creature-dies', 'creature-enters', 'lifegain', 'artifacts', 'enchantments', 'treasure'
])
/** Mechanic jargon that names the enabler, not the payoffs. */
const ENABLER_TERMS = new Set<MechanicId>(['discard'])
/** A key card must do a mechanic at least this strongly for it to be offered as a route. */
const ROUTE_STRENGTH = 0.8

/** @returns Whether `id` names a route. */
export function isWinRoute(id: unknown): id is WinRoute {
  return typeof id === 'string' && (Object.hasOwn(ROUTE_INFO, id) || PAYOFF_MECHANICS.has(id as MechanicId))
}

/** "rewards discarding" → "reward discarding": a card's use phrase for many cards. */
const forMany = (phrase: string) => phrase.replace(/^(\w+?)s\b/, '$1')

/** @returns The route in plain words; a mechanic route stacks cards that reward the mechanic. */
export function routeChoice(route: WinRoute): Choice {
  if (Object.hasOwn(ROUTE_INFO, route)) return ROUTES[route as RouteId]
  const mechanic = MECHANICS[route as MechanicId]
  const term = ENABLER_TERMS.has(route as MechanicId) ? undefined : mechanic.term
  return {
    label: `Win with ${mechanic.label.toLowerCase()}`,
    explain: `Stack cards that ${forMany(mechanic.use)}, and win through them.`,
    ...(term && { term })
  }
}

/** A win route offered to the player. */
export interface RouteOption extends Choice {
  id: WinRoute
  /** Why it suits the key cards, in plain words; absent when nothing points to it. */
  why?: string
}

/** Strongest signal of the focus cards on one side, with its card. */
function strongest<T extends string>(focus: FocusCard[], side: 'provides' | 'uses' | 'roles', ids: T[]) {
  let best: { name: string; signal: Signal<T> } | null = null
  for (const { name, profile } of focus) {
    for (const signal of profile[side] as Array<Signal<T>>) {
      if (ids.includes(signal.id) && signal.weight >= ROUTE_STRENGTH && (!best || signal.weight > best.signal.weight)) best = { name, signal }
    }
  }
  return best
}

/** Why each general route suits the focus cards; null when nothing points to it. */
const ROUTE_REASONS: Record<RouteId, (focus: FocusCard[]) => string | null> = {
  burn: (focus) => {
    const hit = strongest(focus, 'roles', ['burn'])
    return hit && `${hit.name} deals damage on its own.`
  },
  combat: (focus) => {
    const attacks = strongest(focus, 'uses', ['attacking'])
    if (attacks) return `${attacks.name} ${MECHANICS.attacking.use}.`
    const evasion = strongest(focus, 'roles', ['evasion'])
    return evasion && `${evasion.name} gets creatures past blockers.`
  },
  'go-wide': (focus) => {
    const makes = strongest(focus, 'provides', ['creature-tokens'])
    if (makes) return `${makes.name} ${MECHANICS['creature-tokens'].provide}.`
    const rewards = strongest(focus, 'uses', ['creature-tokens'])
    return rewards && `${rewards.name} ${MECHANICS['creature-tokens'].use}.`
  },
  value: (focus) => {
    const cards = strongest(focus, 'roles', ['card-advantage'])
    if (cards) return `${cards.name} gives you extra cards.`
    const mana = strongest(focus, 'roles', ['ramp'])
    return mana && `${mana.name} gets you extra mana.`
  }
}

/**
 * Win routes for a deck built around `focus` (commander first): the general routes, plus stacking
 * payoffs for each mechanic a key card makes happen. Routes the key cards point to come first,
 * with why.
 */
export function routeOptions(focus: FocusCard[]): RouteOption[] {
  const options: RouteOption[] = (Object.keys(ROUTE_INFO) as RouteId[]).map((id) => {
    const why = ROUTE_REASONS[id](focus)
    return { id, ...ROUTES[id], ...(why && { why }) }
  })
  const offered = new Set<MechanicId>()
  for (const { name, profile } of focus) {
    for (const signal of [...profile.provides].sort((a, b) => b.weight - a.weight)) {
      if (!PAYOFF_MECHANICS.has(signal.id) || signal.weight < ROUTE_STRENGTH || offered.has(signal.id)) continue
      offered.add(signal.id)
      options.push({ id: signal.id, ...routeChoice(signal.id), why: `${name} ${providePhrase(signal)}.` })
    }
  }
  return [...options.filter((o) => o.why), ...options.filter((o) => !o.why)]
}

/** Kinds of cards a player can ask to leave out. */
export const AVOIDABLE_ROLES = (Object.keys(ROLES) as RoleId[]).filter((role) => role !== 'land')

/** Brief before the player has answered, for a commander. */
export function newBrief(commander: string): DeckBrief {
  return {
    commander,
    anchors: [],
    pillar: 'resources',
    routes: [],
    pace: 'steady',
    board: 'mixed',
    pets: [],
    avoid: [],
    avoidRoles: [],
    budget: { total: null, perCard: null, basis: DEFAULT_PRICE_BASIS },
    wildcards: 2
  }
}

/** Card names: trimmed, non-empty, distinct, at most `max`, leaving out `except`. */
function names(raw: unknown, max: number, except: string[] = []): string[] {
  const seen = new Set(except.map(nameKey))
  const result: string[] = []
  for (const value of Array.isArray(raw) ? raw : []) {
    const name = typeof value === 'string' ? value.trim() : ''
    if (!name || name.length > MAX_NAME || seen.has(nameKey(name))) continue
    seen.add(nameKey(name))
    result.push(name)
    if (result.length === max) break
  }
  return result
}

/** Positive finite amount, else null. */
const amount = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null)
/** `value` if it is a key of `options`, else `fallback`. */
const oneOf = <K extends string>(options: Record<K, unknown>, value: unknown, fallback: K): K =>
  typeof value === 'string' && Object.hasOwn(options, value) ? (value as K) : fallback

/**
 * Checks a brief from the renderer or a saved draft: invalid answers fall back to
 * {@link newBrief}'s, lists are trimmed to their limits, and a card is in one list at most:
 * commander, key cards, pets, then avoided cards.
 * @returns null without a commander.
 */
export function normalizeBrief(raw: unknown): DeckBrief | null {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, any>
  const [commander] = names([input.commander], 1)
  if (!commander) return null
  const defaults = newBrief(commander)
  const anchors = names(input.anchors, MAX_ANCHORS, [commander])
  const pets = names(input.pets, MAX_NAMES, [commander, ...anchors])
  const budget = (typeof input.budget === 'object' && input.budget !== null ? input.budget : {}) as Record<string, unknown>
  const wildcards = typeof input.wildcards === 'number' && Number.isFinite(input.wildcards) ? Math.round(input.wildcards) : defaults.wildcards
  return {
    commander,
    anchors,
    pillar: oneOf(PILLAR_INFO, input.pillar, defaults.pillar),
    routes: [...new Set<WinRoute>((Array.isArray(input.routes) ? input.routes : []).filter(isWinRoute))].slice(0, MAX_ROUTES),
    pace: oneOf(PACE_INFO, input.pace, defaults.pace),
    board: oneOf(BOARD_INFO, input.board, defaults.board),
    pets,
    avoid: names(input.avoid, MAX_NAMES, [commander, ...anchors, ...pets]),
    avoidRoles: AVOIDABLE_ROLES.filter((role) => Array.isArray(input.avoidRoles) && input.avoidRoles.includes(role)),
    budget: {
      total: amount(budget.total),
      perCard: amount(budget.perCard),
      basis: isPriceBasis(budget.basis) ? budget.basis : defaults.budget.basis
    },
    wildcards: Math.min(MAX_WILDCARDS, Math.max(0, wildcards))
  }
}
