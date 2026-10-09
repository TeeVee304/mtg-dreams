import { nameKey } from '../decklist'
import { mechanicName, MECHANICS, ROLES, type MechanicId, type RoleId, type Signal } from './mechanics'
import { DEFAULT_PRICE_BASIS, isPriceBasis } from '../pricing'
import { providePhrase, type FocusCard } from './synergy'
import type { PriceBasis } from '../types'

/**
 * The deck brief: what the player wants from a new Commander deck. Every choice carries the name
 * players use for it (Aggro, Voltron, Bracket 3…), a plain-words version for new players, and a
 * one-sentence explanation the wizard shows on hover, so it teaches while it asks.
 *
 * @packageDocumentation
 */

/** A choice: what players call it, the same in plain words, and what it means. */
export interface Choice {
  /** What players call it: "Aggro". */
  label: string
  /** The same in plain words, when the name is jargon: "Attack early and often". */
  plain?: string
  /** One sentence for new players. */
  explain: string
}

/** Power levels: the official Commander Brackets. */
const BRACKET_INFO = {
  1: { label: 'Exhibition', plain: 'Theme first, winning last', explain: 'Ultra-casual decks built around a theme or a story. No Game Changers, combos, land destruction or extra turns.' },
  2: { label: 'Core', plain: 'About as strong as a precon', explain: 'The power of a preconstructed deck: fair, social games. No Game Changers, no two-card combos, no land destruction, no chains of extra turns.' },
  3: { label: 'Upgraded', plain: 'Tuned, stronger than a precon', explain: 'Stronger cards and a sharper plan, with up to three Game Changers. No early two-card combos, no land destruction, no chains of extra turns.' },
  4: { label: 'Optimized', plain: 'High power, anything goes', explain: 'Strong, fast, focused decks. Anything legal is allowed.' },
  5: { label: 'cEDH', plain: 'Competitive', explain: 'Competitive Commander: the strongest possible decks, built to win as fast as they can.' }
} as const satisfies Record<number, Choice>

/** Bracket, 1 to 5. */
export type BracketId = keyof typeof BRACKET_INFO
/** Brackets, by number. */
export const BRACKETS: Record<BracketId, Choice> = BRACKET_INFO
/** Bracket numbers, in order. */
export const BRACKET_IDS = [1, 2, 3, 4, 5] as const satisfies readonly BracketId[]

/** How the deck plays. */
const STRATEGY_INFO = {
  aggro: { label: 'Aggro', plain: 'Attack early and often', explain: 'Cheap creatures and fast attacks, to win before opponents set up.' },
  midrange: { label: 'Midrange', plain: 'Flexible and steady', explain: 'A balance of threats and answers that adapts to the table and grinds out value.' },
  control: { label: 'Control', plain: 'Answer everything, win late', explain: 'Stop what opponents do with removal, counterspells and board wipes, then win the long game.' },
  combo: { label: 'Combo', plain: 'Assemble a winning combination', explain: 'Find and protect a few cards that win together.' },
  'big-mana': { label: 'Big Mana', plain: 'Ramp into huge spells', explain: 'Get far more mana than anyone else and cast enormous threats.' }
} as const satisfies Record<string, Choice>

/** Strategy id. */
export type StrategyId = keyof typeof STRATEGY_INFO
/** Strategies, by id. */
export const STRATEGIES: Record<StrategyId, Choice> = STRATEGY_INFO

/** How the deck wins: win conditions players recognize, whatever the commander. */
const WINCON_INFO = {
  beatdown: { label: 'Beatdown', plain: 'Win with big attackers', explain: 'Get large or hard-to-block creatures through, turn after turn.' },
  'go-wide': { label: 'Go Wide', plain: 'Swarm the board', explain: 'Make lots of small creatures, then make them all stronger at once.' },
  voltron: { label: 'Voltron', plain: 'One huge threat', explain: 'Build up one creature, often your commander, and protect it: 21 commander damage wins alone.' },
  'group-slug': { label: 'Group Slug', plain: 'Burn and drain the table', explain: 'Deal damage to, or drain life from, every opponent at once, without attacking.' },
  combo: { label: 'Combo', plain: 'Win with a combination', explain: 'A few cards that win together in one big turn.' },
  mill: { label: 'Mill', plain: 'Empty their libraries', explain: 'Put opponents’ libraries into their graveyards until they can’t draw.' },
  infect: { label: 'Infect', plain: 'Poison them out', explain: 'Give each opponent ten poison counters; their life totals don’t matter.' }
} as const satisfies Record<string, Choice>

/** Win condition id. */
export type WinconId = keyof typeof WINCON_INFO
/** Win conditions, by id. */
export const WINCONS: Record<WinconId, Choice> = WINCON_INFO

/** How much the deck stops what opponents do. */
const INTERACTION_INFO = {
  light: { label: 'Light', plain: 'A few answers', explain: 'Focus on your own plan, with just a few answers for real threats.' },
  some: { label: 'Moderate', plain: 'A healthy number of answers', explain: 'Enough removal and board wipes to handle what most tables do.' },
  heavy: { label: 'Heavy', plain: 'Lots of answers', explain: 'Plenty of removal, board wipes and, in blue, counterspells.' }
} as const satisfies Record<string, Choice>

/** Interaction level id. */
export type InteractionId = keyof typeof INTERACTION_INFO
/** Interaction levels, by id. */
export const INTERACTIONS: Record<InteractionId, Choice> = INTERACTION_INFO

/** How fast the deck comes together, which follows from its strategy. */
export type PaceId = 'fast' | 'steady' | 'big'

/** Pace of each strategy. */
const STRATEGY_PACE: Record<StrategyId, PaceId> = { aggro: 'fast', midrange: 'steady', control: 'steady', combo: 'fast', 'big-mana': 'big' }
/** Interaction each strategy plays when the player leaves it to the wizard. */
const STRATEGY_INTERACTION: Record<StrategyId, InteractionId> = { aggro: 'light', midrange: 'some', control: 'heavy', combo: 'some', 'big-mana': 'some' }

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
  /** Power level, as the official Commander Brackets. */
  bracket: BracketId
  /** How the deck plays; null leaves it to the commander. */
  strategy: StrategyId | null
  /** How the deck wins, up to {@link MAX_WINCONS}; none leaves it to the commander's strengths. */
  wincons: WinconId[]
  /** What the commander and key cards do that the deck should multiply, up to {@link MAX_ENGINES}. */
  engines: MechanicId[]
  /** How much the deck stops opponents; `auto` follows the strategy. */
  interaction: InteractionId | 'auto'
  /** The deck idea the player picked, if any. */
  ideaId: string | null
  /** Cards the player would love to see in it. */
  pets: string[]
  /** Cards to keep out. */
  avoid: string[]
  /** Kinds of cards to keep out, e.g. counterspells. */
  avoidRoles: RoleId[]
  /** Cards the player locked into the deck, so rebuilding keeps them. */
  locks: string[]
  budget: Budget
  /** Cards picked for surprise, through connections players rarely think of: 0 to {@link MAX_WILDCARDS}. */
  wildcards: number
}

/** Most key cards besides the commander. */
export const MAX_ANCHORS = 3
/** Most win conditions. */
export const MAX_WINCONS = 2
/** Most engines. */
export const MAX_ENGINES = 2
/** Most wildcards. */
export const MAX_WILDCARDS = 10
/** Longest card name accepted. */
const MAX_NAME = 200
/** Most pet, avoided or locked cards. */
const MAX_NAMES = 50

/** A key card must do something at least this strongly for it to count. */
const STRENGTH = 0.8
/** Most engines offered, so the question stays short. */
const MAX_ENGINE_OPTIONS = 8
/** Mechanics too narrow to build a deck's engine on. */
const NOT_ENGINES = new Set<MechanicId>(['nonbasic-utility', 'instants-sorceries', 'tribe-any'])

/** @returns The pace the brief's strategy plays at; steady without one. */
export const paceOf = (brief: Pick<DeckBrief, 'strategy'>): PaceId => (brief.strategy ? STRATEGY_PACE[brief.strategy] : 'steady')

/** @returns The interaction level, the strategy's when left to the wizard. */
export function interactionOf(brief: Pick<DeckBrief, 'strategy' | 'interaction'>): InteractionId {
  if (brief.interaction !== 'auto') return brief.interaction
  return brief.strategy ? STRATEGY_INTERACTION[brief.strategy] : 'some'
}

/** @returns Whether `id` names a win condition. */
export function isWinconId(id: unknown): id is WinconId {
  return typeof id === 'string' && Object.hasOwn(WINCON_INFO, id)
}

/** @returns Whether `id` names a mechanic an engine can be built on. */
export function isEngine(id: unknown): id is MechanicId {
  return typeof id === 'string' && Object.hasOwn(MECHANICS, id) && !NOT_ENGINES.has(id as MechanicId)
}

/** The win condition as a choice. */
export const winconChoice = (wincon: WinconId): Choice => WINCONS[wincon]

/** An engine as a choice: its community name, its plain label, and what it means. */
export function engineChoice(engine: MechanicId): Choice {
  const { label, explain } = MECHANICS[engine]
  const name = mechanicName(engine)
  return { label: name, ...(name !== label && { plain: label }), explain }
}

/** An answer offered to the player, with why it suits their cards. */
export interface Option<T extends string> extends Choice {
  id: T
  /** Why it suits the commander and key cards, in plain words; absent when nothing points to it. */
  why?: string
}

/** A win condition offered to the player. */
export type WinconOption = Option<WinconId>
/** An engine offered to the player. */
export type EngineOption = Option<MechanicId>

/** Strongest signal of the focus cards on one side, with its card. */
function strongest<T extends string>(focus: FocusCard[], side: 'provides' | 'uses' | 'roles', ids: T[]) {
  let best: { name: string; signal: Signal<T> } | null = null
  for (const { name, profile } of focus) {
    for (const signal of profile[side] as Array<Signal<T>>) {
      if (ids.includes(signal.id) && signal.weight >= STRENGTH && (!best || signal.weight > best.signal.weight)) best = { name, signal }
    }
  }
  return best
}

/** Why each win condition suits the focus cards; null when nothing points to it. */
const WINCON_REASONS: Record<WinconId, (focus: FocusCard[]) => string | null> = {
  beatdown: (focus) => {
    const attacks = strongest(focus, 'uses', ['attacking'])
    if (attacks) return `${attacks.name} ${MECHANICS.attacking.use}.`
    const lands = strongest(focus, 'provides', ['land-creatures'])
    if (lands) return `${lands.name} ${MECHANICS['land-creatures'].provide}, ready to attack.`
    const evasion = strongest(focus, 'roles', ['evasion'])
    return evasion && `${evasion.name} gets creatures past blockers.`
  },
  'go-wide': (focus) => {
    const makes = strongest(focus, 'provides', ['creature-tokens'])
    if (makes) return `${makes.name} ${MECHANICS['creature-tokens'].provide}.`
    const rewards = strongest(focus, 'uses', ['creature-tokens', 'land-creatures'])
    return rewards && `${rewards.name} ${MECHANICS[rewards.signal.id].use}.`
  },
  voltron: (focus) => {
    const gear = strongest(focus, 'uses', ['equipment-auras'])
    if (gear) return `${gear.name} ${MECHANICS['equipment-auras'].use}.`
    const counters = strongest(focus, 'provides', ['counters'])
    return counters && `${counters.name} ${MECHANICS.counters.provide}, growing one big threat.`
  },
  'group-slug': (focus) => {
    const hit = strongest(focus, 'roles', ['burn'])
    if (hit) return `${hit.name} deals damage on its own.`
    const drain = strongest(focus, 'uses', ['drain'])
    return drain && `${drain.name} ${MECHANICS.drain.use}.`
  },
  combo: (focus) => {
    const tutor = strongest(focus, 'roles', ['tutor'])
    return tutor && `${tutor.name} finds the cards you need.`
  },
  mill: (focus) => {
    const mill = strongest(focus, 'roles', ['mill'])
    return mill && `${mill.name} mills your opponents.`
  },
  infect: (focus) => {
    const gives = strongest(focus, 'provides', ['poison'])
    if (gives) return `${gives.name} ${MECHANICS.poison.provide}.`
    const adds = strongest(focus, 'uses', ['poison'])
    return adds && `${adds.name} ${MECHANICS.poison.use}.`
  }
}

/** Win conditions, those the commander and key cards point to first, with why. */
export function winconOptions(focus: FocusCard[]): WinconOption[] {
  const options = (Object.keys(WINCON_INFO) as WinconId[]).map((id): WinconOption => {
    const why = WINCON_REASONS[id](focus)
    return { id, ...WINCONS[id], ...(why && { why }) }
  })
  return [...options.filter((o) => o.why), ...options.filter((o) => !o.why)]
}

/**
 * What the commander and key cards do, or want, strongly enough to build the deck around: each
 * is an engine the deck can multiply, with more cards that do it and more that reward it.
 */
export function engineOptions(focus: FocusCard[]): EngineOption[] {
  const found = focus.flatMap(({ name, profile }) => [
    ...profile.uses.map((s) => ({ s, why: `${name} ${MECHANICS[s.id].use}.` })),
    ...profile.provides.map((s) => ({ s, why: `${name} ${providePhrase(s)}.` }))
  ])
  const options = new Map<MechanicId, EngineOption>()
  // Strongest first; the sort is stable, so on a tie the commander leads, and wanting beats doing.
  for (const { s, why } of found.sort((a, b) => b.s.weight - a.s.weight)) {
    if (s.weight < STRENGTH || !isEngine(s.id) || options.has(s.id)) continue
    options.set(s.id, { id: s.id, ...engineChoice(s.id), why })
  }
  return [...options.values()].slice(0, MAX_ENGINE_OPTIONS)
}

/** Kinds of cards a player can ask to leave out. */
export const AVOIDABLE_ROLES = (Object.keys(ROLES) as RoleId[]).filter((role) => role !== 'land')

/** Brief before the player has answered, for a commander. */
export function newBrief(commander: string): DeckBrief {
  return {
    commander,
    anchors: [],
    bracket: 2,
    strategy: null,
    wincons: [],
    engines: [],
    interaction: 'auto',
    ideaId: null,
    pets: [],
    avoid: [],
    avoidRoles: [],
    locks: [],
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

/** Win conditions of briefs saved before they had community names. */
const OLD_WINCONS: Record<string, WinconId> = { combat: 'beatdown', burn: 'group-slug', poison: 'infect' }
/** Strategies of briefs saved with a pace instead. */
const OLD_PACES: Record<string, StrategyId> = { fast: 'aggro', big: 'big-mana' }

/**
 * Checks a brief from the renderer or a saved draft: invalid answers fall back to
 * {@link newBrief}'s, lists are trimmed to their limits, and a card is in one list at most:
 * commander, key cards, pets, then avoided cards. Briefs saved by earlier versions keep their
 * answers: ways to win become win conditions, a pace becomes a strategy.
 * @returns null without a commander.
 */
export function normalizeBrief(raw: unknown): DeckBrief | null {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, any>
  const [commander] = names([input.commander], 1)
  if (!commander) return null
  const defaults = newBrief(commander)
  const anchors = names(input.anchors, MAX_ANCHORS, [commander])
  const pets = names(input.pets, MAX_NAMES, [commander, ...anchors])
  const avoid = names(input.avoid, MAX_NAMES, [commander, ...anchors, ...pets])
  const budget = (typeof input.budget === 'object' && input.budget !== null ? input.budget : {}) as Record<string, unknown>
  const wildcards = typeof input.wildcards === 'number' && Number.isFinite(input.wildcards) ? Math.round(input.wildcards) : defaults.wildcards
  const rawWincons = (Array.isArray(input.wincons) ? input.wincons : Array.isArray(input.routes) ? input.routes : []).map(
    (id: unknown) => (typeof id === 'string' && OLD_WINCONS[id]) || id
  )
  const strategy = oneOf<StrategyId | 'none'>({ ...STRATEGY_INFO, none: 0 }, input.strategy ?? OLD_PACES[input.pace], 'none')
  return {
    commander,
    anchors,
    bracket: BRACKET_IDS.find((id) => id === input.bracket) ?? defaults.bracket,
    strategy: strategy === 'none' ? null : strategy,
    wincons: [...new Set(rawWincons.filter(isWinconId))].slice(0, MAX_WINCONS) as WinconId[],
    engines: [...new Set((Array.isArray(input.engines) ? input.engines : []).filter(isEngine))].slice(0, MAX_ENGINES) as MechanicId[],
    interaction: oneOf<InteractionId | 'auto'>({ ...INTERACTION_INFO, auto: 0 }, input.interaction, defaults.interaction),
    ideaId: typeof input.ideaId === 'string' && input.ideaId.length <= MAX_NAME ? input.ideaId : null,
    pets,
    avoid,
    avoidRoles: AVOIDABLE_ROLES.filter((role) => Array.isArray(input.avoidRoles) && input.avoidRoles.includes(role)),
    locks: names(input.locks, MAX_NAMES, [commander, ...anchors, ...avoid]),
    budget: {
      total: amount(budget.total),
      perCard: amount(budget.perCard),
      basis: isPriceBasis(budget.basis) ? budget.basis : defaults.budget.basis
    },
    wildcards: Math.min(MAX_WILDCARDS, Math.max(0, wildcards))
  }
}
