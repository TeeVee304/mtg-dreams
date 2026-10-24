import { useEffect, useMemo, useState } from 'react'
import { bundledBasic } from '@shared/basics'
import { TYPE_GROUPS, type ColorFilter } from '@shared/cards'
import type { CopyPool } from '@shared/copies'
import { STAT_COLORS } from '@shared/deckStats'
import {
  averageDeckName,
  averageDeckPath,
  averageDeckText,
  BRACKETS,
  EDHREC_SITE,
  NO_FILTERS,
  type AverageDeck,
  type AverageDeckFilters,
  type Bracket,
  type Budget
} from '@shared/deckWizard/averageDeck'
import { nameKey } from '@shared/decklist'
import { canLead, FORMATS, listCommanders } from '@shared/formats'
import { preconListName } from '@shared/precons'
import type { InventoryItem, ListKind } from '@shared/types'
import { ui } from '@shared/text'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { artCrop, MANA_SYMBOLS } from '../../lib/artwork'
import { leadersLabel } from '../../lib/themeTags'
import { cleanError, formatEur } from '../../lib/format'
import { getCardInfo, requestCardInfos, useCardInfoVersion } from '../../stores/cardinfo'
import type { CardList } from '../../stores/library'
import { cheapestVersion, requestPrintings, usePrintingsVersion } from '../../stores/printings'
import { useSettings } from '../../stores/settings'
import { CardSearch } from '../../components/CardSearch'
import { HeroPortrait } from '../../components/HeroArt'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { WizardHat } from './WizardHat'
import './wizard.css'
import { openExternal } from '../../lib/desktop'

/** Props of {@link DeckWizard}. */
interface DeckWizardProps {
  onClose: () => void
  /** Creates the list; errors show in the wizard. */
  onCreate: (kind: ListKind, name: string, text: string, cards: number) => Promise<void>
  /** All decks, wishlists and brews: names to keep free, and commanders already leading a deck. */
  lists: CardList[]
  inventory: Map<string, InventoryItem>
  /** Copy claims: copies built decks hold aren't yours to build with. */
  pool: CopyPool
}

/** What the wizard shows for the chosen commander and mix. */
type DeckState =
  | { status: 'loading' }
  | { status: 'ok'; deck: AverageDeck }
  | { status: 'missing' }
  | { status: 'error'; message: string }

/** Themes shown as chips; the rest are in a menu. */
const THEME_CHIPS = 5
/** Commanders you own offered before searching. */
const OWNED_SHOWN = 6
/** @returns The type section of an EDHREC card type, as the app's lists group cards; `Other` for one they don't name. */
const groupOf = (type: string) => TYPE_GROUPS.find((group) => group.id === type)?.id ?? 'Other'
/** The Commander format, whose leaders the wizard offers. */
const COMMANDER = FORMATS.find((format) => format.id === 'commander')!
/** Stands for a new list in copy claims: it gets the copies no list reserves. */
const NEW_LIST = { kind: 'brew' as const, name: '' }

/**
 * The Deck Wizard: pick a commander (and its partner, if it has one), and it shows EDHREC's average
 * deck for it, narrowed by theme,
 * power bracket and budget, with the cards you own ticked and what the rest would cost. The deck is
 * saved as a brew, a wishlist, or a deck once you own every card.
 */
export function DeckWizard({ onClose, onCreate, lists, inventory, pool }: DeckWizardProps) {
  const { priceBasis, bundleBasics } = useSettings()
  usePrintingsVersion()
  useCardInfoVersion()
  /** The commander, then its partner if it has one. */
  const [commanders, setCommanders] = useState<string[]>([])
  const commander = commanders[0] ?? null
  /** Stands for the commanders in effects' dependencies. */
  const leadersKey = commanders.join('\n')
  const [filters, setFilters] = useState<AverageDeckFilters>(NO_FILTERS)
  /** The commander's deck over all its decks: its themes, whatever the mix. */
  const [base, setBase] = useState<AverageDeck | null>(null)
  const [state, setState] = useState<DeckState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  const [name, setName] = useState<string | null>(null)
  const create = useAsyncAction()

  useEffect(() => {
    if (!leadersKey) return
    let current = true
    setState({ status: 'loading' })
    window.deckWizard
      .averageDeck(leadersKey.split('\n'), filters)
      .then((result) => {
        if (!current) return
        setState(result)
        if (result.status === 'ok' && filters === NO_FILTERS) setBase(result.deck)
      })
      .catch((error) => current && setState({ status: 'error', message: cleanError(error) }))
    return () => {
      current = false
    }
  }, [leadersKey, filters, retry])

  // Themes come from the commanders' whole deck, fetched first.
  useEffect(() => {
    if (!leadersKey || base?.commanders.join('\n') === leadersKey || filters === NO_FILTERS) return
    void window.deckWizard
      .averageDeck(leadersKey.split('\n'), NO_FILTERS)
      .then((result) => result.status === 'ok' && setBase(result.deck))
  }, [leadersKey, base, filters])

  const deck = state.status === 'ok' ? state.deck : null
  useEffect(() => {
    for (const name of leadersKey ? leadersKey.split('\n') : []) requestPrintings(name, { priority: 'high' })
    for (const card of deck?.cards ?? []) requestPrintings(card.name)
  }, [leadersKey, deck])

  /** Legendary creatures you own that lead no deck yet, most copies first. */
  const owned = useMemo(() => {
    const leading = new Set(lists.flatMap((list) => listCommanders(list.lines)).map(nameKey))
    return [...inventory.values()].filter((item) => !leading.has(nameKey(item.name)))
  }, [inventory, lists])
  useEffect(() => requestCardInfos(owned.map((item) => item.name), bundleBasics), [owned, bundleBasics])
  const suggestions = owned
    .filter((item) => {
      const info = getCardInfo(item.name, bundleBasics)
      return info ? canLead(COMMANDER, info) : false
    })
    .slice(0, OWNED_SHOWN)

  /** Leads with `leaders`, over all their decks. */
  const lead = (leaders: string[]) => {
    setCommanders(leaders)
    setFilters(NO_FILTERS)
    setBase(null)
    setName(null)
  }
  const pick = (card: string) => lead([card])

  /** Copies of a card you can build with: those no list reserves. */
  const free = (card: string) => {
    const key = nameKey(card)
    const qty = inventory.get(key)?.qty ?? 0
    return Math.max(0, qty - pool.held(NEW_LIST, key, qty))
  }
  const rows = (deck?.cards ?? []).map((card) => {
    const basic = Boolean(bundledBasic(card.name, bundleBasics))
    const have = basic ? card.qty : Math.min(card.qty, free(card.name))
    const unit = basic ? 0 : cheapestVersion(card.name, priceBasis)?.unit
    return { ...card, have, unit }
  })
  const leaders = deck?.commanders ?? []
  const total = rows.reduce((sum, row) => sum + row.qty, 0) + leaders.length
  const ownedCards = rows.reduce((sum, row) => sum + row.have, 0) + leaders.filter((name) => free(name) > 0).length
  const leadersCost = commanders.reduce((sum, name) => sum + (free(name) === 0 ? (cheapestVersion(name, priceBasis)?.unit ?? 0) : 0), 0)
  const cost = rows.reduce((sum, row) => sum + (row.unit ?? 0) * (row.qty - row.have), leadersCost)
  const pricing = rows.some((row) => row.unit === undefined && row.have < row.qty)

  const themes = base?.themes ?? []
  const theme = themes.find((option) => option.slug === filters.theme) ?? null
  const chips = themes.slice(0, THEME_CHIPS)
  const extra = theme && !chips.includes(theme) ? theme : null
  const defaultName = commander ? averageDeckName(commanders, theme?.name ?? null) : ''
  const listName = name ?? defaultName
  const namesOf = (kind: ListKind) => lists.filter((list) => list.kind === kind).map((list) => list.name)
  const save = (kind: ListKind) =>
    create.run(() => (deck ? onCreate(kind, preconListName(listName.trim(), namesOf(kind)), averageDeckText(deck), total) : undefined))

  const info = commander ? getCardInfo(commander, bundleBasics) : undefined
  const identity = new Set(commanders.flatMap((name) => getCardInfo(name, bundleBasics)?.colorIdentity ?? []))
  const arts = commanders.flatMap((name) => artCrop(cheapestVersion(name, priceBasis)?.printing) ?? [])
  const edhrecUrl = commander ? `${EDHREC_SITE}/${averageDeckPath(commanders, filters)}` : 'https://edhrec.com'
  const set = (patch: Partial<AverageDeckFilters>) => setFilters({ ...filters, ...patch })
  const text = ui.wizard

  const footer = deck && (
    <>
      <label className="field-inline wizard-name">
        {text.listName}
        <input value={listName} onChange={(event) => setName(event.target.value)} />
      </label>
      <span className="muted small">{text.brewHint}</span>
      {create.error && <span className="warn small">{create.error}</span>}
      <span className="spacer" />
      {ownedCards >= total && (
        <button type="button" disabled={create.busy || !listName.trim()} onClick={() => void save('deck')}>
          {text.saveAs.deck}
        </button>
      )}
      <button type="button" disabled={create.busy || !listName.trim()} onClick={() => void save('wishlist')}>
        {text.saveAs.wishlist}
      </button>
      <button type="button" className="primary" disabled={create.busy || !listName.trim()} onClick={() => void save('brew')}>
        {text.saveAs.brew}
      </button>
    </>
  )

  return (
    <Modal title={text.name} icon={<WizardHat size={20} />} size="wizard" onClose={onClose} footer={footer || undefined}>
      {!commander ? (
        <div className="wizard-start">
          <p className="muted">{text.intro}</p>
          <CardSearch id="wizard-commander" placeholder={text.anyCommander} onPick={pick} />
          {suggestions.length > 0 && (
            <>
              <span className="muted small">{text.owned}</span>
              <div className="wizard-owned">
                {suggestions.map((item) => {
                  const crop = artCrop(cheapestVersion(item.name, priceBasis)?.printing)
                  return (
                    <button key={item.name} type="button" className="wizard-owned-item" onClick={() => pick(item.name)}>
                      {crop ? <img src={crop} alt="" draggable={false} /> : <span className="wizard-owned-blank" />}
                      <span>{item.name}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="wizard-deck">
          <section className="wizard-banner art-hero">
            <HeroPortrait arts={arts} />
            <div className="wizard-banner-text">
              <span className="small">{text.commanders(commanders.length)}</span>
              <h3 title={ui.common.and(commanders)}>{leadersLabel(commanders)}</h3>
              <span className="wizard-colors">
                {STAT_COLORS.filter((color) => identity.has(color)).map((color) => (
                  <img key={color} src={MANA_SYMBOLS[color as ColorFilter]} alt={color} draggable={false} />
                ))}
                {base && text.decksOnEdhrec(base.decks.toLocaleString('fr-FR'))}
              </span>
            </div>
            <span className="spacer" />
            <div className="wizard-other">
              {commanders.length === 1 && info?.partner && (
                <CardSearch id="wizard-partner" placeholder={text.addPartner} onPick={(card) => lead([commanders[0], card])} />
              )}
              {commanders.length > 1 && (
                <button type="button" className="wizard-drop-partner" onClick={() => lead([commanders[0]])}>
                  <Icon name="close" /> {text.without(commanders[1])}
                </button>
              )}
              <CardSearch id="wizard-commander" placeholder={text.anotherCommander} onPick={pick} />
            </div>
          </section>

          <div className="wizard-filters">
            <div className="wizard-filter-row" role="group" aria-label={text.theme}>
              <span className="wizard-filter-label">{text.theme}</span>
              <button type="button" className={`wizard-chip${filters.theme === null ? ' on' : ''}`} onClick={() => set({ theme: null })}>
                {text.any}
              </button>
              {[...chips, ...(extra ? [extra] : [])].map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  className={`wizard-chip${filters.theme === option.slug ? ' on' : ''}`}
                  aria-pressed={filters.theme === option.slug}
                  onClick={() => set({ theme: option.slug })}
                >
                  {option.name} <span className="wizard-chip-count">{option.decks.toLocaleString('fr-FR')}</span>
                </button>
              ))}
              {themes.length > THEME_CHIPS && (
                <select
                  className="wizard-more-themes"
                  aria-label={text.moreThemes}
                  value=""
                  onChange={(event) => event.target.value && set({ theme: event.target.value })}
                >
                  <option value="">{text.allThemes(themes.length)}</option>
                  {themes.slice(THEME_CHIPS).map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name} ({option.decks})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="wizard-filter-row">
              <span className="wizard-filter-label">{text.bracket}</span>
              <Choice
                label={text.bracket}
                value={filters.bracket}
                options={BRACKETS.map((bracket, index) => ({ id: bracket.id, label: String(index + 1), title: bracket.label }))}
                onChange={(bracket) => set({ bracket: bracket as Bracket | null })}
              />
              <span className="wizard-filter-label">{text.budget}</span>
              <Choice
                label={text.budget}
                value={filters.budget}
                options={[
                  { id: 'budget', label: text.budgets.budget },
                  { id: 'expensive', label: text.budgets.expensive }
                ]}
                onChange={(budget) => set({ budget: budget as Budget | null })}
              />
            </div>
          </div>

          {state.status === 'loading' && <p className="muted wizard-note">{text.asking}</p>}
          {state.status === 'missing' && (
            <div className="wizard-note wizard-missing">
              <p>
                {filters === NO_FILTERS || (!filters.theme && !filters.bracket && !filters.budget)
                  ? text.noDecks(ui.common.and(commanders), commanders.length > 1)
                  : text.tooFew}
              </p>
              <div className="wizard-actions">
                {filters.theme && <button type="button" onClick={() => set({ theme: null })}>{text.anyTheme}</button>}
                {filters.bracket && <button type="button" onClick={() => set({ bracket: null })}>{text.anyBracket}</button>}
                {filters.budget && <button type="button" onClick={() => set({ budget: null })}>{text.anyBudget}</button>}
              </div>
            </div>
          )}
          {state.status === 'error' && (
            <div className="wizard-note wizard-error" role="alert">
              <p>
                {state.message} {text.orOpen}
              </p>
              <div className="wizard-actions">
                <button type="button" className="primary" onClick={() => setRetry(retry + 1)}>
                  {text.retry}
                </button>
                <button type="button" onClick={() => void openExternal(edhrecUrl)}>
                  {text.openEdhrec} <Icon name="external" />
                </button>
              </div>
            </div>
          )}

          {deck && (
            <>
              <div className="wizard-facts">
                <div className="wizard-fact">
                  <span className="small muted">{text.youOwn}</span>
                  <strong>
                    {ownedCards} <span className="muted">/ {total}</span>
                  </strong>
                  <div className="progress" aria-label={text.ownedOf(ownedCards, total)}>
                    <div style={{ width: `${Math.round((ownedCards / Math.max(total, 1)) * 100)}%` }} />
                  </div>
                </div>
                <div className="wizard-fact">
                  <span className="small muted">{text.toBuild}</span>
                  <strong>{pricing ? '…' : formatEur(cost)}</strong>
                </div>
                <div className="wizard-fact">
                  <span className="small muted">{text.averageOf}</span>
                  <strong>
                    {deck.decks.toLocaleString('fr-FR')} <span className="muted small">{text.decks(theme?.name ?? null)}</span>
                  </strong>
                </div>
                <span className="spacer" />
                <button type="button" className="link-btn" onClick={() => void openExternal(edhrecUrl)}>
                  {text.openEdhrec} <Icon name="external" />
                </button>
              </div>

              <div className="wizard-cards" aria-label={`${ui.count.cards(total)}`}>
                {TYPE_GROUPS.map(({ id, label }) => {
                  const group = rows.filter((row) => groupOf(row.type) === id)
                  if (group.length === 0) return null
                  return (
                    <section key={id} className="wizard-group">
                      <h4>
                        {label} <span className="muted small">{group.reduce((sum, row) => sum + row.qty, 0)}</span>
                      </h4>
                      {group.map((row) => {
                        const all = row.have >= row.qty
                        return (
                          <div key={row.name} className={`wizard-card${all ? ' owned' : ''}`} title={all ? text.ownIt : undefined}>
                            <span className="wizard-tick" aria-label={all ? text.ownedTick : text.missing}>
                              {all ? '✓' : '·'}
                            </span>
                            <span className="wizard-card-name">
                              {row.qty > 1 && `${row.qty} `}
                              {row.name}
                            </span>
                            <span className="wizard-card-price">
                              {all ? '' : row.unit === undefined ? '…' : row.unit === null ? '—' : formatEur(row.unit * (row.qty - row.have))}
                            </span>
                          </div>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

/** Props of {@link Choice}. */
interface ChoiceProps {
  label: string
  /** Chosen option id; null for Any. */
  value: string | null
  options: { id: string; label: string; title?: string }[]
  onChange: (id: string | null) => void
}

/** A segmented choice with Any first. */
function Choice({ label, value, options, onChange }: ChoiceProps) {
  return (
    <div className="segmented wizard-choice" role="radiogroup" aria-label={label}>
      {[{ id: null, label: ui.wizard.any, title: undefined }, ...options].map((option) => (
        <button
          key={option.id ?? 'any'}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'selected' : undefined}
          title={option.title}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
