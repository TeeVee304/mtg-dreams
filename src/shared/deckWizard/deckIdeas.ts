import { comboBreaks } from './brackets'
import { cardStrength } from './cardStrength'
import type { Combo } from './combos'
import { engineChoice, engineOptions, isEngine, STRATEGIES, winconOptions, WINCONS, type Choice, type StrategyId, type WinconId } from './deckBrief'
import { nameKey } from '../decklist'
import { engineSignal, isLand, MIN_FIT, PRECON_IDEA, winconSignal, type CandidatePool, type PoolCard } from './deckPool'
import type { MechanicId } from './vocabulary'
import type { FocusCard } from './synergy'

/**
 * Deck ideas: a few concrete concepts for the commander and key cards, such as "Vampire Tribal
 * Aggro", each a strategy, a win condition and a theme, with a pitch and sample cards. New players
 * pick one instead of answering abstract questions; experts can still build their own.
 *
 * @packageDocumentation
 */

/** A concept for the deck. */
export interface DeckIdea {
  /** Stable id: strategy, win condition and theme. */
  id: string
  /** In community words: "Vampire Tribal Aggro". */
  title: string
  /** Why it suits the cards and how it wins, in plain words. */
  pitch: string
  strategy: StrategyId
  wincons: WinconId[]
  engines: MechanicId[]
  /** Strategy, win condition and theme as choices, for tags with explanations. */
  tags: Choice[]
  /** Cards that show what the deck plays. */
  samples: string[]
  /** Eligible cards that carry the theme: how much the deck has to choose from. */
  depth: number
}

/** Most ideas offered. */
export const MAX_IDEAS = 4
/** Sample cards per idea. */
const SAMPLES = 5
/** Fewest cards that must carry a theme for a deck to be built on it. */
const MIN_DEPTH = 20
/** Sample cards should do the theme strongly, when enough do. */
const SAMPLE_FIT = 0.8

/** The tag of an idea built on the commander's own precon. */
const PRECON_TAG: Choice = {
  label: 'Precon',
  plain: 'Official deck',
  explain: 'A preconstructed deck: ready to play out of the box, sold by Wizards of the Coast. This idea keeps its plan and its best cards, and upgrades the rest.'
}

/** The win condition a theme leads to most naturally. */
const NATURAL_WINCON: Partial<Record<MechanicId, WinconId>> = {
  'creature-tokens': 'go-wide',
  counters: 'voltron',
  'equipment-auras': 'voltron',
  poison: 'infect',
  drain: 'group-slug',
  'creature-dies': 'group-slug',
  lifegain: 'group-slug',
  'spell-cast': 'group-slug',
  'land-creatures': 'beatdown',
  attacking: 'beatdown',
  flying: 'beatdown'
}

/** How a theme usually plays, when it doesn't win by attacking. */
const THEME_STRATEGY: Partial<Record<MechanicId, StrategyId>> = {
  planeswalkers: 'control',
  'card-draw': 'control',
  'spell-cast': 'control',
  proliferate: 'midrange',
  graveyard: 'midrange',
  'lands-in-graveyard': 'midrange',
  lifegain: 'midrange',
  drain: 'midrange',
  'creature-dies': 'midrange',
  copies: 'midrange',
  artifacts: 'midrange',
  enchantments: 'midrange',
  'land-play': 'midrange',
  'land-count': 'big-mana',
  'x-spells': 'big-mana'
}

/** "Get large creatures through." from "Get large creatures through." with a lowercase start. */
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** How the commander and theme suggest the deck plays, for a win condition. */
function strategyFor(lead: FocusCard, manaValue: number, wincon: WinconId, engine: MechanicId | null): StrategyId {
  if (wincon === 'combo') return 'combo'
  if (wincon === 'mill') return 'control'
  const themed = engine && THEME_STRATEGY[engine]
  if (themed) return themed
  const strong = (side: 'roles' | 'provides', id: string) => lead.profile[side].some((s) => s.id === id && s.weight >= 0.8)
  if (strong('roles', 'counterspell') || (strong('roles', 'card-advantage') && strong('roles', 'removal'))) return 'control'
  if (manaValue >= 7 || strong('roles', 'ramp') || strong('provides', 'extra-land-drop')) return 'big-mana'
  // Creature decks that win in combat attack early.
  if (['beatdown', 'go-wide', 'voltron', 'infect'].includes(wincon)) return 'aggro'
  return 'midrange'
}

/** How well a card shows an idea: it carries the theme or the win condition, the stronger the better. */
function sampleScore(entry: PoolCard, engine: MechanicId | null, wincon: WinconId): { fits: number; score: number } {
  const fits = Math.max(engine ? (engineSignal(engine, entry.profile)?.weight ?? 0) : 0, (winconSignal(wincon, entry.profile)?.weight ?? 0) * 0.8)
  if (fits < MIN_FIT) return { fits, score: 0 }
  return { fits, score: fits * (0.5 + 0.5 * cardStrength(entry.card)) + 0.3 * Math.min(1, entry.synergy) }
}

/**
 * @param focus - The commander, then the key cards.
 * @param pool - The cards the deck may play, within the budget.
 * @param combos - Commander Spellbook combos among the pool that use the commander or a key card.
 * @returns Up to {@link MAX_IDEAS} ideas, the best suited first; each theme once.
 */
export function deckIdeas(focus: FocusCard[], pool: CandidatePool, combos: Combo[] = []): DeckIdea[] {
  const lead = focus[0]
  const manaValue = pool.commander.card.manaValue
  const eligible = [...pool.eligible.values()].filter((entry) => !isLand(entry.card))
  const suited = winconOptions(focus).filter((option) => option.why)
  const ideas: DeckIdea[] = []

  const make = (engine: MechanicId | null, wincon: WinconId, reason: string, samples?: string[]): DeckIdea => {
    const strategy = strategyFor(lead, manaValue, wincon, engine)
    const ranked = eligible.map((entry) => ({ entry, ...sampleScore(entry, engine, wincon) })).filter((r) => r.score > 0)
    const strong = ranked.filter((r) => r.fits >= SAMPLE_FIT)
    const theme = engine ? engineChoice(engine) : null
    const titleParts = [theme?.label, wincon === 'combo' ? null : STRATEGIES[strategy].label, wincon === 'combo' ? 'Combo' : null]
    return {
      id: [strategy, wincon, engine ?? ''].join('|'),
      title: titleParts.filter(Boolean).join(' '),
      pitch: `${reason} Win with ${WINCONS[wincon].label}: ${lowerFirst(WINCONS[wincon].explain)}`,
      strategy,
      wincons: [wincon],
      engines: engine ? [engine] : [],
      tags: [STRATEGIES[strategy], WINCONS[wincon], ...(theme ? [theme] : [])],
      samples: samples ?? (strong.length >= SAMPLES ? strong : ranked).sort((a, b) => b.score - a.score).slice(0, SAMPLES).map((r) => r.entry.card.name),
      depth: engine ? eligible.filter((entry) => (engineSignal(engine, entry.profile)?.weight ?? 0) >= MIN_FIT).length : ranked.length
    }
  }

  // The commander's own precon, when it leads one: its themes, and its cards kept where they fit.
  const own = pool.community?.own
  if (own) {
    const deep = (engine: MechanicId) => eligible.filter((entry) => (engineSignal(engine, entry.profile)?.weight ?? 0) >= MIN_FIT).length >= MIN_DEPTH
    const engine = pool.community!.ownThemes.find((id) => isEngine(id) && deep(id)) ?? null
    const wincon = (engine && NATURAL_WINCON[engine]) ?? suited.find((s) => s.id !== 'combo')?.id ?? 'beatdown'
    const ownKeys = new Set(own.cards.map(nameKey))
    const samples = eligible
      .filter((entry) => ownKeys.has(nameKey(entry.card.name)))
      .sort((a, b) => cardStrength(b.card) - cardStrength(a.card) || a.card.name.localeCompare(b.card.name))
      .slice(0, SAMPLES)
      .map((entry) => entry.card.name)
    const idea = make(engine, wincon, `${lead.name} leads the official precon “${own.name}”. Build on its plan: its cards that fit stay, the rest is upgraded.`, samples)
    ideas.push({ ...idea, id: `${PRECON_IDEA}${own.id}`, title: `${own.name}, upgraded`, tags: [PRECON_TAG, ...idea.tags] })
  }

  // A combo the bracket allows, with the commander or a key card in it, leads when there is one.
  const focusKeys = new Set(focus.map((f) => nameKey(f.name)))
  const combo = combos
    .filter((c) => c.cards.some((card) => focusKeys.has(nameKey(card))))
    .filter((c) => !comboBreaks({ cards: c.cards, twoCard: c.cards.length === 2, lock: false, manaValue: c.manaValue }, pool.brief.bracket))
    .sort((a, b) => b.popularity - a.popularity)[0]
  if (combo) {
    const pieces = combo.cards.filter((card) => !focusKeys.has(nameKey(card)))
    ideas.push(make(null, 'combo', `${combo.cards.join(' + ')}: ${combo.results.slice(0, 2).join(', ').toLowerCase()}.`, pieces.slice(0, SAMPLES)))
  }

  // Themes that tie the commander and key cards together first; then the most distinctive, which
  // fewer cards carry: they're what makes this commander different.
  const involved = (engine: MechanicId) =>
    focus.filter(({ profile }) => [...profile.provides, ...profile.uses].some((s) => s.id === engine && s.weight >= MIN_FIT)).length
  const themed = engineOptions(focus)
    .filter((option) => !ideas.some((idea) => idea.engines.includes(option.id)))
    .map((option) => ({ idea: make(option.id, NATURAL_WINCON[option.id] ?? suited.find((s) => s.id !== 'combo')?.id ?? 'beatdown', option.why ?? ''), ties: involved(option.id) }))
    .filter(({ idea }) => idea.depth >= MIN_DEPTH)
    .sort((a, b) => b.ties - a.ties || a.idea.depth - b.idea.depth)
  ideas.push(...themed.slice(0, MAX_IDEAS - ideas.length).map(({ idea }) => idea))
  // Without themes deep enough, the win conditions the cards point to make the ideas.
  for (const option of suited) {
    if (ideas.length >= MAX_IDEAS) break
    if (option.id === 'combo' || ideas.some((idea) => idea.wincons.includes(option.id))) continue
    ideas.push(make(null, option.id, option.why ?? ''))
  }
  return ideas
}
