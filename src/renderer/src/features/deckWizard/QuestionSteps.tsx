import { useCallback, useEffect, useId, useState } from 'react'
import type { DeckPlanSummary } from '@shared/deckWizard/api'
import {
  AVOIDABLE_ROLES,
  BRACKET_IDS,
  BRACKETS,
  interactionOf,
  INTERACTIONS,
  MAX_ENGINES,
  MAX_WILDCARDS,
  MAX_WINCONS,
  STRATEGIES,
  type BracketId,
  type DeckBrief,
  type EngineOption,
  type InteractionId,
  type StrategyId,
  type WinconOption
} from '@shared/deckWizard/deckBrief'
import type { DeckIdea } from '@shared/deckWizard/deckIdeas'
import { ROLES, type MechanicId } from '@shared/deckWizard/mechanics'
import { PRICE_BASES } from '@shared/pricing'
import { formatEur } from '../../lib/format'
import { Segmented } from '../../components/Controls'
import { previewHandlers } from '../../components/HoverPreview'
import { CardSearchBox } from './CardSearchBox'
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup'
import { shortName } from './model'
import { Tip } from './Term'

/**
 * The wizard's questions: how strong and how costly the deck may be (Power & budget), what kind of
 * deck it is (Deck idea), and the finer points (Tune). Every answer has a sensible default, so a
 * player can stop answering at any point and build.
 *
 * @packageDocumentation
 */

/** Props of a question step. */
interface StepProps {
  brief: DeckBrief
  update: (patch: Partial<DeckBrief>) => void
}

/** Answers from a record of choices. */
const options = <T extends string>(choices: Record<T, { label: string; plain?: string; explain: string }>): Array<ChoiceOption<T>> =>
  (Object.keys(choices) as T[]).map((id) => ({ id, ...choices[id] }))

/** `list` with `id` toggled; null when it is full. */
const toggled = <T,>(list: T[], id: T, max: number): T[] | null =>
  list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : null

/** Bracket answers, by number as text. */
const BRACKET_OPTIONS: Array<ChoiceOption<`${BracketId}`>> = BRACKET_IDS.map((id) => ({
  id: `${id}`,
  label: `Bracket ${id} · ${BRACKETS[id].label}`,
  plain: BRACKETS[id].plain,
  explain: BRACKETS[id].explain
}))

/** Props of {@link PowerStep}. */
interface PowerStepProps extends StepProps {
  /** The plan for the brief as it is, for counting the cards that fit; null while loading. */
  plan: DeckPlanSummary | null
  planError: string | null
}

/** Step 2: how strong the deck may be, and what it may cost. */
export function PowerStep({ brief, update, plan, planError }: PowerStepProps) {
  const { budget } = brief
  const fits = plan && plan.brief.budget.perCard === budget.perCard && plan.brief.budget.total === budget.total
  return (
    <div className="wizard-step">
      <h3>
        How strong should the deck be?{' '}
        <span className="muted small">
          ·{' '}
          <Tip text="The official power levels of Commander, so a table can agree how strong its decks should be." focusable>
            Commander Brackets
          </Tip>
        </span>
      </h3>
      <p className="step-intro">Pick the level of the table you play at. Bracket 2 is about as strong as a precon.</p>
      <ChoiceGroup
        single
        label="Power level"
        options={BRACKET_OPTIONS}
        selected={[`${brief.bracket}`]}
        onToggle={(id) => update({ bracket: Number(id) as BracketId })}
      />

      <h3>What may the deck cost?</h3>
      <p className="step-intro">Leave a box empty for no limit.</p>
      <div className="budget-fields">
        <AmountField label="The whole deck, commander included" value={budget.total} onChange={(total) => update({ budget: { ...budget, total } })} />
        <AmountField label="Most for one card" value={budget.perCard} onChange={(perCard) => update({ budget: { ...budget, perCard } })} />
      </div>
      <p className="budget-live small" aria-live="polite">
        {planError ? (
          <span className="warn">{planError}</span>
        ) : fits ? (
          <>
            <strong>{plan.eligible.toLocaleString()}</strong> cards in {shortName(brief.commander)}’s colors fit
            {plan.excluded.overCap > 0 && budget.perCard !== null && (
              <>
                ; {plan.excluded.overCap.toLocaleString()} cost more than {formatEur(budget.perCard)}
              </>
            )}
            .
          </>
        ) : (
          <span className="muted">Counting the cards that fit…</span>
        )}
      </p>
      <details className="more-options">
        <summary>More options</summary>
        <div className="field">
          <span>Price to go by</span>
          <Segmented
            label="Price to go by"
            options={PRICE_BASES.map((b) => ({ id: b.id, label: b.label, title: b.hint }))}
            value={budget.basis}
            onChange={(basis) => update({ budget: { ...budget, basis } })}
          />
        </div>
      </details>
    </div>
  )
}

/** Ideas for the deck, or why there are none yet. */
export interface IdeasState {
  list: DeckIdea[] | null
  error: string | null
}

/** Props of {@link IdeaStep}. */
interface IdeaStepProps extends StepProps {
  ideas: IdeasState
  /** Win conditions and themes for building your own; null while loading. */
  wincons: WinconOption[] | null
  engines: EngineOption[] | null
}

/** Step 3: a deck idea to pick, or your own strategy, win conditions and themes. */
export function IdeaStep({ brief, update, ideas, wincons, engines }: IdeaStepProps) {
  const own = brief.ideaId === null && (brief.strategy !== null || brief.wincons.length > 0 || brief.engines.length > 0)
  const choose = (idea: DeckIdea) => update({ ideaId: idea.id, strategy: idea.strategy, wincons: idea.wincons, engines: idea.engines })
  const toggleWincon = (id: WinconOption['id']) => {
    const next = toggled(brief.wincons, id, MAX_WINCONS)
    if (next) update({ wincons: next, ideaId: null })
  }
  const toggleEngine = (id: MechanicId) => {
    const next = toggled(brief.engines, id, MAX_ENGINES)
    if (next) update({ engines: next, ideaId: null })
  }
  return (
    <div className="wizard-step">
      <h3>Pick a deck idea</h3>
      <p className="step-intro">
        Ideas for {shortName(brief.commander)}
        {brief.anchors.length > 0 ? ' and your key cards' : ''}, within your bracket and budget. Hover a tag to see what it means.
      </p>
      {ideas.error ? (
        <p className="warn">{ideas.error}</p>
      ) : ideas.list === null ? (
        <p className="muted">
          <span className="spinner" aria-hidden="true" /> Thinking up decks…
        </p>
      ) : ideas.list.length === 0 ? (
        <p className="muted">No idea stands out for these cards. Build your own below.</p>
      ) : (
        <div className="ideas" role="radiogroup" aria-label="Deck ideas">
          {ideas.list.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} chosen={brief.ideaId === idea.id} onChoose={() => choose(idea)} />
          ))}
        </div>
      )}

      <details className="more-options" open={own || undefined}>
        <summary>Build your own</summary>
        <h4>Strategy</h4>
        <p className="step-intro">How the deck plays. Pick none to let the commander decide.</p>
        <ChoiceGroup
          label="Strategy"
          options={options(STRATEGIES)}
          selected={brief.strategy ? [brief.strategy] : []}
          onToggle={(id: StrategyId) => update({ strategy: id === brief.strategy ? null : id, ideaId: null })}
        />
        <h4>Win conditions</h4>
        <p className="step-intro">Up to {MAX_WINCONS}. ✦ marks the ones your cards point to.</p>
        {wincons ? (
          <ChoiceGroup label="Win conditions" options={wincons} selected={brief.wincons} onToggle={toggleWincon} />
        ) : (
          <p className="muted">Reading what your cards do…</p>
        )}
        <h4>Themes</h4>
        <p className="step-intro">
          Up to {MAX_ENGINES}: what your cards do best, so the deck adds cards that do the same and cards that reward it.
        </p>
        {engines === null ? (
          <p className="muted">Reading what your cards do…</p>
        ) : engines.length > 0 ? (
          <ChoiceGroup label="Themes" options={engines} selected={brief.engines} onToggle={toggleEngine} />
        ) : (
          <p className="muted">Your cards don’t lean on one thing strongly, so the deck connects to them however it can.</p>
        )}
      </details>
    </div>
  )
}

/** One deck idea: its name, tags explained on hover, pitch and sample cards. */
function IdeaCard({ idea, chosen, onChoose }: { idea: DeckIdea; chosen: boolean; onChoose: () => void }) {
  const base = useId()
  const tagIds = idea.tags.map((_, i) => `${base}-${i}`)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-describedby={tagIds.join(' ')}
      className={`idea${chosen ? ' selected' : ''}`}
      onClick={onChoose}
    >
      <span className="idea-title">{idea.title}</span>
      <span className="idea-tags">
        {idea.tags.map((tag, i) => (
          <Tip key={tag.label} id={tagIds[i]} text={`${tag.plain ? `${tag.plain}: ` : ''}${tag.explain}`}>
            <span className="chip idea-tag">{tag.label}</span>
          </Tip>
        ))}
      </span>
      <span className="idea-pitch">{idea.pitch}</span>
      {idea.samples.length > 0 && (
        <span className="idea-samples small">
          <span className="muted">Plays cards like </span>
          {idea.samples.map((name, i) => (
            <span key={name}>
              <span className="idea-sample" {...previewHandlers({ name })}>
                {name}
              </span>
              {i < idea.samples.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/** Interaction answers: the wizard's pick by strategy, or the player's own. */
function interactionOptions(brief: DeckBrief): Array<ChoiceOption<InteractionId | 'auto'>> {
  const auto = INTERACTIONS[interactionOf({ strategy: brief.strategy, interaction: 'auto' })]
  return [
    {
      id: 'auto',
      label: 'Auto',
      plain: `${auto.label}${brief.strategy ? `, as ${STRATEGIES[brief.strategy].label} plays` : ''}`,
      explain: 'Let the strategy decide: Control decks answer a lot, Aggro decks a little.'
    },
    ...options(INTERACTIONS)
  ]
}

/** Step 4: interaction, wildcards, pet cards and what to leave out, all optional. */
export function TuneStep({ brief, update }: StepProps) {
  const basis = brief.budget.basis
  const searchCards = useCallback(
    (query: string) => window.deckWizard.searchCards(query, { commander: brief.commander, basis }),
    [brief.commander, basis]
  )
  const taken = (name: string) => [brief.commander, ...brief.anchors, ...brief.pets, ...brief.avoid].includes(name)
  return (
    <div className="wizard-step">
      <p className="step-intro">Everything here is optional; the defaults suit most decks.</p>
      <h3>
        <Tip text="Cards that stop or answer what opponents do: removal, board wipes, counterspells." focusable>
          Interaction
        </Tip>
      </h3>
      <ChoiceGroup
        single
        label="Interaction"
        options={interactionOptions(brief)}
        selected={[brief.interaction]}
        onToggle={(interaction) => update({ interaction })}
      />

      <h3>Wildcards</h3>
      <p className="step-intro">
        Surprising picks that connect to your plan in ways players rarely think of. More wildcards means fewer of the
        expected cards.
      </p>
      <label className="wildcards">
        <input type="range" min={0} max={MAX_WILDCARDS} value={brief.wildcards} onChange={(event) => update({ wildcards: Number(event.target.value) })} />
        <span className="wildcards-count">{brief.wildcards}</span>
      </label>

      <h3>Pet cards</h3>
      <p className="step-intro">Cards you’d love to see in the deck. They go in if they fit the budget.</p>
      <CardSearchBox
        label="Search pet cards"
        placeholder={`Search cards in ${shortName(brief.commander)}'s colors`}
        search={searchCards}
        onPick={(card) => !taken(card.name) && update({ pets: [...brief.pets, card.name] })}
      />
      <NameChips names={brief.pets} onRemove={(name) => update({ pets: brief.pets.filter((p) => p !== name) })} />

      <h3>Leave out</h3>
      <p className="step-intro">Cards, or kinds of cards, you don’t want to play with or against your friends.</p>
      <CardSearchBox
        label="Search cards to leave out"
        placeholder="Search cards to leave out"
        search={searchCards}
        onPick={(card) => !taken(card.name) && update({ avoid: [...brief.avoid, card.name] })}
      />
      <NameChips names={brief.avoid} onRemove={(name) => update({ avoid: brief.avoid.filter((a) => a !== name) })} />
      <div className="kind-toggles" role="group" aria-label="Kinds of cards to leave out">
        {AVOIDABLE_ROLES.map((role) => {
          const on = brief.avoidRoles.includes(role)
          return (
            <button
              key={role}
              type="button"
              className={`kind-toggle${on ? ' selected' : ''}`}
              aria-pressed={on}
              title={`${ROLES[role].plain ? `${ROLES[role].plain}: ` : ''}${ROLES[role].explain}`}
              onClick={() => update({ avoidRoles: on ? brief.avoidRoles.filter((r) => r !== role) : [...brief.avoidRoles, role] })}
            >
              {on ? '✕ ' : ''}
              {ROLES[role].label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Card names as removable chips. */
function NameChips({ names, onRemove }: { names: string[]; onRemove: (name: string) => void }) {
  if (names.length === 0) return null
  return (
    <ul className="name-chips">
      {names.map((name) => (
        <li key={name} className="chip name-chip">
          {name}
          <button type="button" className="chip-remove" aria-label={`Remove ${name}`} onClick={() => onRemove(name)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

/** A EUR amount; empty for no limit. */
function AmountField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => setText(value === null ? '' : String(value)), [value])
  const commit = () => {
    const amount = Number.parseFloat(text.replace(',', '.'))
    const next = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null
    if (next !== value) onChange(next)
    setText(next === null ? '' : String(next))
  }
  return (
    <label className="field amount-field">
      <span>{label}</span>
      <span className="amount-input">
        €
        <input
          inputMode="decimal"
          value={text}
          placeholder="No limit"
          onChange={(event) => setText(event.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
      </span>
    </label>
  )
}
