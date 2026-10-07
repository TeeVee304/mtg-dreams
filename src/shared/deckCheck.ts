import { isBasicLand } from './cards'
import { nameKey } from './decklist'
import type { DeckBrief } from './deckBrief'
import { fitSignal, isLand, MIN_FIT } from './deckPool'
import { DECK_CARDS, type DeckTemplate, type SlotId } from './deckTemplate'
import { colorIdentityIssue, findFormat, legalityIssue } from './formats'
import type { CardProfile } from './mechanics'
import { conflictsWith, explainConflict, type FocusCard } from './synergy'
import type { LibraryCard } from './types'

/**
 * Checks a proposed 99 against the rules and the player's brief, whoever picked it: every card
 * must exist, be legal, fit the commander's colors and the budget, and come from the cards
 * offered; the deck must have 99 cards and the key cards. Shortfalls against the plan and cards
 * that work against the key cards are warnings, explained in plain words.
 *
 * @packageDocumentation
 */

/** Something wrong or worth knowing. `error`: the deck can't be used as is. */
export interface DeckIssue {
  severity: 'error' | 'warning' | 'note'
  message: string
  /** Card it is about. */
  card?: string
}

/** Result of {@link checkDeck}. */
export interface DeckCheck {
  issues: DeckIssue[]
  /** Cards in the 99. */
  cards: number
  /** EUR, commander included; unpriced cards count as 0. */
  total: number
  /** Cards per slot, as picked. */
  slots: Partial<Record<SlotId, number>>
}

/** What a check needs to know. */
export interface CheckContext {
  brief: DeckBrief
  template: DeckTemplate
  commander: LibraryCard
  /** The commander, then the key cards. */
  focus: FocusCard[]
  /** Card and what it does, by name; undefined if unknown. */
  lookup: (name: string) => { card: LibraryCard; profile: CardProfile } | undefined
  /** EUR on the brief's price basis; null if unknown. */
  price: (card: LibraryCard) => number | null
  /** Name keys of the cards offered to choose from; omitted, any card may be picked. */
  offered?: Set<string>
}

/** A picked card, as {@link checkDeck} reads it. */
export interface CheckedPick {
  name: string
  qty: number
  slot: SlotId
}

/** "€12.50". */
const eur = (value: number) => `€${value.toFixed(2)}`
/** Commander format. */
const COMMANDER = findFormat('commander')!

/** @returns Issues of a proposed 99, errors first, with its card count, cost and cards per slot. */
export function checkDeck(picks: CheckedPick[], context: CheckContext): DeckCheck {
  const { brief, template, commander, focus } = context
  const issues: DeckIssue[] = []
  const error = (message: string, card?: string) => issues.push({ severity: 'error', message, ...(card && { card }) })
  const warn = (message: string, card?: string) => issues.push({ severity: 'warning', message, ...(card && { card }) })
  const note = (message: string, card?: string) => issues.push({ severity: 'note', message, ...(card && { card }) })

  const copies = new Map<string, number>()
  for (const pick of picks) copies.set(nameKey(pick.name), (copies.get(nameKey(pick.name)) ?? 0) + pick.qty)
  const anchors = new Set(brief.anchors.map(nameKey))
  const chosenByPlayer = new Set([...anchors, ...brief.pets.map(nameKey)])
  const avoid = new Set(brief.avoid.map(nameKey))
  const known: Array<{ qty: number; card: LibraryCard; profile: CardProfile }> = []
  const slots: DeckCheck['slots'] = {}
  let cards = 0
  let total = context.price(commander) ?? 0
  let unpriced = 0
  const seen = new Set<string>()

  for (const pick of picks) {
    cards += pick.qty
    slots[pick.slot] = (slots[pick.slot] ?? 0) + pick.qty
    const key = nameKey(pick.name)
    const found = context.lookup(pick.name)
    if (!found) {
      error(`“${pick.name}” isn't a card MTG Dreams knows.`, pick.name)
      continue
    }
    const { card } = found
    const price = context.price(card)
    total += (price ?? 0) * pick.qty
    known.push({ qty: pick.qty, ...found })
    if (seen.has(key)) continue
    seen.add(key)
    if (key === nameKey(commander.name)) {
      error(`${card.name} is your commander, so it doesn't go in the 99.`, card.name)
      continue
    }
    const before = issues.length
    const legality = legalityIssue(COMMANDER, card, copies.get(key) ?? 0)
    if (legality) (legality.severity === 'error' ? error : warn)(`${card.name}: ${legality.message}.`, card.name)
    const colors = colorIdentityIssue(card, commander.colorIdentity)
    if (colors) error(`${card.name} is outside ${commander.name}'s colors.`, card.name)
    if (avoid.has(key)) error(`You asked to leave out ${card.name}.`, card.name)
    if (price === null) {
      unpriced++
    } else if (brief.budget.perCard !== null && price > brief.budget.perCard) {
      const message = `${card.name} costs ${eur(price)}, over your ${eur(brief.budget.perCard)} limit per card.`
      if (anchors.has(key)) warn(`${message} It stays, as one of your key cards.`, card.name)
      else error(message, card.name)
    }
    const offered = !context.offered || context.offered.has(key) || chosenByPlayer.has(key) || isBasicLand(card.name)
    if (!offered && issues.length === before) error(`${card.name} wasn't among the cards offered for this deck.`, card.name)
    const avoidedRole = found.profile.roles.find((r) => brief.avoidRoles.includes(r.id) && r.weight >= MIN_FIT)
    if (avoidedRole && !chosenByPlayer.has(key)) {
      const role = template.slots.find((slot) => slot.role === avoidedRole.id)?.label.toLowerCase() ?? avoidedRole.id
      warn(`You asked to leave out ${role} cards, and ${card.name} is one.`, card.name)
    }
    const others = focus.filter((f) => nameKey(f.name) !== key)
    for (const conflict of conflictsWith(found.profile, others)) warn(explainConflict(card.name, conflict), card.name)
  }

  if (cards !== DECK_CARDS) error(`The deck has ${cards} cards besides the commander; Commander needs exactly ${DECK_CARDS}.`)
  if (brief.budget.total !== null && total > brief.budget.total) {
    error(`The deck costs ${eur(total)}, ${eur(total - brief.budget.total)} over your ${eur(brief.budget.total)} budget.`)
  }
  if (unpriced > 0) warn(`${unpriced} ${unpriced === 1 ? 'card has' : 'cards have'} no Cardmarket price, so the total may be higher.`)
  for (const anchor of brief.anchors) {
    if (!copies.has(nameKey(anchor))) error(`Your key card ${anchor} isn't in the deck.`, anchor)
  }
  for (const pet of brief.pets) {
    if (!copies.has(nameKey(pet))) note(`Your pet card ${pet} didn't make it in.`, pet)
  }

  // Coverage of each job, counting every card that does it, whatever slot it was picked for.
  for (const slot of template.slots) {
    if (slot.id === 'land') {
      const lands = known.reduce((sum, { qty, card }) => sum + (isLand(card) ? qty : 0), 0)
      if (Math.abs(lands - slot.count) > 1) warn(`The deck has ${lands} lands; the plan calls for ${slot.count}.`)
      continue
    }
    if (slot.count === 0 || (!slot.role && !slot.route)) continue
    const doing = known.filter(({ card, profile }) => !isLand(card) && (fitSignal(slot, profile)?.weight ?? 0) >= MIN_FIT).length
    if (doing < slot.count) {
      const what = slot.route ? `cards for “${slot.label}”` : `${slot.label.toLowerCase()} cards${slot.term ? ` (${slot.term})` : ''}`
      warn(`Only ${doing} ${what}; the plan calls for ${slot.count}.`)
    }
  }

  const order = { error: 0, warning: 1, note: 2 }
  issues.sort((a, b) => order[a.severity] - order[b.severity])
  return { issues, cards, total, slots }
}
