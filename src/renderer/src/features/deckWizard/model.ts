import {
  BRACKETS,
  engineChoice,
  interactionOf,
  INTERACTIONS,
  newBrief,
  normalizeBrief,
  STRATEGIES,
  winconChoice,
  type DeckBrief
} from '@shared/deckWizard/deckBrief'
import type { BuiltDeck } from '@shared/deckWizard/deckSession'
import { ROLES } from '@shared/deckWizard/mechanics'
import { formatEur } from '../../lib/format'

/**
 * The Deck Wizard's steps and saved draft, and the brief in the words players use.
 *
 * @packageDocumentation
 */

/** The wizard's steps, in order. */
export const STEPS = [
  { id: 'commander', label: 'Commander' },
  { id: 'power', label: 'Power & budget' },
  { id: 'idea', label: 'Deck idea' },
  { id: 'tune', label: 'Tune' },
  { id: 'build', label: 'Build' },
  { id: 'review', label: 'Review' }
] as const

/** A step's id. */
export type StepId = (typeof STEPS)[number]['id']

/** Everything the wizard keeps between openings. */
export interface WizardDraft {
  /** The answers so far; the commander is empty until chosen. */
  brief: DeckBrief
  step: StepId
  /** The deck built for the brief, if any. */
  deck: BuiltDeck | null
  /** The brief the deck was built from, as {@link briefKey}. */
  builtFrom: string | null
  /** Name for the wishlist. */
  name: string
}

/** Steps of drafts saved by earlier versions. */
const OLD_STEPS: Record<string, StepId> = { plan: 'idea', style: 'tune', budget: 'power' }

/** localStorage key of the draft. */
const KEY = 'mtg-dreams.deckWizard'

/** A fresh draft. */
export const newDraft = (): WizardDraft => ({ brief: newBrief(''), step: 'commander', deck: null, builtFrom: null, name: '' })

/**
 * Identifies a brief's answers, for telling whether a deck still matches them. Locks and the idea
 * picked don't change what the deck is built to, so they leave the key alone.
 */
export const briefKey = (brief: DeckBrief) => JSON.stringify({ ...brief, locks: [], ideaId: null })

/** @returns The saved draft; null if none, or none worth resuming (no commander chosen). */
export function loadDraft(): WizardDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    const brief = normalizeBrief(raw?.brief)
    if (!brief) return null
    const known = OLD_STEPS[raw.step] ?? raw.step
    const step = STEPS.some((s) => s.id === known) ? (known as StepId) : 'commander'
    const deck = raw.deck && Array.isArray(raw.deck.picks) && raw.deck.check ? (raw.deck as BuiltDeck) : null
    return {
      brief,
      step: step === 'review' && !deck ? 'build' : step,
      deck,
      builtFrom: deck && typeof raw.builtFrom === 'string' ? raw.builtFrom : null,
      name: typeof raw.name === 'string' ? raw.name : ''
    }
  } catch {
    return null
  }
}

/** Saves the draft; storage errors are ignored. */
export function saveDraft(draft: WizardDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {}
}

/** Forgets the draft. */
export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

/** "Flubs" from "Flubs, the Fool". */
export const shortName = (name: string) => name.split(/,| \/\/ /)[0]

/** "A, B and C". */
export const listWords = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/** A line of the brief, with the step that sets it. */
export interface BriefLine {
  label: string
  value: string
  step: StepId
  /** What the value means, shown on hover. */
  tip?: string
  /** Not answered yet. */
  empty?: boolean
}

/** @returns The brief in the words players use, line by line. */
export function briefLines(brief: DeckBrief): BriefLine[] {
  const { total, perCard } = brief.budget
  const budget = [total !== null && `${formatEur(total)} in all`, perCard !== null && `at most ${formatEur(perCard)} a card`].filter(Boolean)
  const leaveOut = [...brief.avoid, ...brief.avoidRoles.map((role) => ROLES[role].label)]
  const bracket = BRACKETS[brief.bracket]
  const strategy = brief.strategy && STRATEGIES[brief.strategy]
  const interaction = INTERACTIONS[interactionOf(brief)]
  return [
    { label: 'Commander', value: brief.commander || 'Not chosen yet', step: 'commander', empty: !brief.commander },
    { label: 'Key cards', value: brief.anchors.length > 0 ? listWords(brief.anchors) : 'None', step: 'commander', empty: brief.anchors.length === 0 },
    { label: 'Power level', value: `Bracket ${brief.bracket} · ${bracket.label}`, step: 'power', tip: bracket.explain },
    { label: 'Budget', value: budget.length > 0 ? budget.join(', ') : 'No limit', step: 'power', empty: budget.length === 0 },
    {
      label: 'Strategy',
      value: strategy ? strategy.label : 'Up to the commander',
      step: 'idea',
      empty: !strategy,
      ...(strategy && { tip: strategy.explain })
    },
    {
      label: 'Win conditions',
      value: brief.wincons.length > 0 ? listWords(brief.wincons.map((w) => winconChoice(w).label)) : 'The commander’s strengths',
      step: 'idea',
      empty: brief.wincons.length === 0,
      ...(brief.wincons.length > 0 && { tip: brief.wincons.map((w) => `${winconChoice(w).label}: ${winconChoice(w).explain}`).join(' ') })
    },
    {
      label: 'Themes',
      value: brief.engines.length > 0 ? listWords(brief.engines.map((e) => engineChoice(e).label)) : 'Whatever connects',
      step: 'idea',
      empty: brief.engines.length === 0,
      ...(brief.engines.length > 0 && { tip: brief.engines.map((e) => `${engineChoice(e).label}: ${engineChoice(e).explain}`).join(' ') })
    },
    {
      label: 'Interaction',
      value: brief.interaction === 'auto' ? `${interaction.label}${strategy ? `, for ${strategy.label}` : ''}` : interaction.label,
      step: 'tune',
      tip: interaction.explain
    },
    { label: 'Pet cards', value: brief.pets.length > 0 ? listWords(brief.pets) : 'None', step: 'tune', empty: brief.pets.length === 0 },
    { label: 'Leave out', value: leaveOut.length > 0 ? listWords(leaveOut) : 'Nothing', step: 'tune', empty: leaveOut.length === 0 },
    { label: 'Wildcards', value: String(brief.wildcards), step: 'tune' }
  ]
}
