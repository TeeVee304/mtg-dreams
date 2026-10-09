import { useCallback, useId, type ReactNode } from 'react'
import type { CardTrait, DeckFocusInfo, FocusCardInfo } from '@shared/deckWizard/api'
import { MAX_ANCHORS, type DeckBrief } from '@shared/deckWizard/deckBrief'
import { formatEur } from '../../lib/format'
import { previewHandlers } from '../../components/HoverPreview'
import { CardSearchBox } from './CardSearchBox'
import { shortName } from '@shared/cards'

/** What the wizard knows about the chosen commander and key cards. */
export interface FocusState {
  info: DeckFocusInfo | null
  error: string | null
  loading: boolean
}

/** Props of {@link CommanderStep}. */
interface CommanderStepProps {
  brief: DeckBrief
  update: (patch: Partial<DeckBrief>) => void
  focus: FocusState
  /** Why cards can't be searched yet (the card library is downloading); absent when they can. */
  unavailable?: string
}

/** Step 1: the commander, and up to three key cards the deck is built around. */
export function CommanderStep({ brief, update, focus, unavailable }: CommanderStepProps) {
  const basis = brief.budget.basis
  const searchCommanders = useCallback((query: string) => window.deckWizard.searchCards(query, { commanders: true, basis }), [basis])
  const searchCards = useCallback(
    (query: string) =>
      window.deckWizard.searchCards(query, { commander: brief.commander, basis }).then((hits) => hits.filter((hit) => !brief.anchors.includes(hit.name))),
    [brief.commander, brief.anchors, basis]
  )
  const commander = focus.info?.commander.name === brief.commander ? focus.info.commander : null

  return (
    <div className="wizard-step">
      <h3>Who leads your deck?</h3>
      <p className="step-intro">
        Your commander sets the deck’s colors and, more than any other card, how it plays. Pick a legendary creature.
      </p>
      <CardSearchBox
        label="Search commanders"
        placeholder={brief.commander ? 'Search for another commander' : 'Search commanders, e.g. Flubs'}
        search={searchCommanders}
        disabled={unavailable}
        onPick={(card) => {
          if (card.name !== brief.commander) update({ commander: card.name, anchors: [], wincons: [], engines: [], pets: [], avoid: [] })
        }}
      />
      {brief.commander && (
        <>
          {commander ? (
            <FocusCardView info={commander} />
          ) : (
            <div className="focus-card">
              <strong>{brief.commander}</strong>
              {focus.loading && <p className="muted small">Reading its rules text…</p>}
            </div>
          )}
          {focus.error && <p className="warn">{focus.error}</p>}
          <p className="muted tiny">Choosing another commander clears the key cards, ways to win, pet cards and cards to leave out.</p>

          <h3>Key cards</h3>
          <p className="step-intro">
            Optional: up to {MAX_ANCHORS} cards the deck must be built around, like Valakut for Flubs. They are always in
            the deck, and every other card is picked to work with them and your commander.
          </p>
          <CardSearchBox
            label="Search key cards"
            placeholder={brief.anchors.length >= MAX_ANCHORS ? `That's ${MAX_ANCHORS} key cards already` : `Search cards in ${shortName(brief.commander)}'s colors`}
            search={searchCards}
            disabled={unavailable ?? (brief.anchors.length >= MAX_ANCHORS ? `That's ${MAX_ANCHORS} key cards already` : undefined)}
            onPick={(card) => update({ anchors: [...brief.anchors, card.name], pets: brief.pets.filter((p) => p !== card.name), avoid: brief.avoid.filter((a) => a !== card.name) })}
          />
          <ul className="anchor-list">
            {brief.anchors.map((name) => {
              const info = focus.info?.anchors.find((a) => a.name === name)
              return (
                <li key={name}>
                  {info ? (
                    <FocusCardView info={info}>
                      {info.links.length > 0 ? (
                        <ul className="link-list">
                          {info.links.slice(0, 3).map((link) => (
                            <li key={link}>{link}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted small">
                          MTG Dreams found no connection to {shortName(brief.commander)} in the rules text. That’s fine for a
                          card you love: the deck will make room for it.
                        </p>
                      )}
                      {info.conflicts.map((conflict) => (
                        <p key={conflict} className="warn small">
                          ⚠ {conflict}
                        </p>
                      ))}
                    </FocusCardView>
                  ) : (
                    <div className="focus-card">
                      <strong>{name}</strong>
                    </div>
                  )}
                  <button type="button" className="icon-btn anchor-remove" aria-label={`Remove ${name}`} title="Remove" onClick={() => update({ anchors: brief.anchors.filter((a) => a !== name) })}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/** A commander or key card: cost, type, price, and what it does in plain words. */
function FocusCardView({ info, children }: { info: FocusCardInfo; children?: ReactNode }) {
  return (
    <div className="focus-card">
      <div className="focus-head" {...previewHandlers({ name: info.name })}>
        <strong>{info.name}</strong>
        <span className="muted small">{info.manaCost}</span>
        <span className="muted small">{info.typeLine}</span>
        <span className="small focus-price">{formatEur(info.price)}</span>
      </div>
      <Traits label="Makes happen" traits={info.provides} />
      <Traits label="Wants" traits={info.needs} />
      <Traits label="Jobs" traits={info.jobs} />
      {children}
    </div>
  )
}

/** A row of traits, each explaining itself on hover or focus. */
function Traits({ label, traits }: { label: string; traits: CardTrait[] }) {
  if (traits.length === 0) return null
  return (
    <div className="traits">
      <span className="traits-label muted small">{label}</span>
      {traits.map((trait) => (
        <TraitChip key={trait.label} trait={trait} />
      ))}
    </div>
  )
}

/** One trait, with its explanation and jargon on hover or focus. */
function TraitChip({ trait }: { trait: CardTrait }): ReactNode {
  const id = useId()
  return (
    <span className="chip trait" tabIndex={0} aria-describedby={id}>
      {trait.label}
      <span id={id} role="tooltip" className="tip term-tip">
        {trait.plain && <strong>{trait.plain}: </strong>}
        {trait.explain}
      </span>
    </span>
  )
}
