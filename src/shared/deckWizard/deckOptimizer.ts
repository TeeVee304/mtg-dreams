import { BRACKET_RULES, comboBreaks } from './brackets'
import type { BracketFacts } from './combos'
import { nameKey } from '../decklist'
import { pickReason, type DeckPick, type Draft } from './deckDraft'
import { slotScore, type CandidatePool, type PoolCard } from './deckPool'
import type { Slot, SlotId } from './deckTemplate'
import type { MechanicId, RoleId } from './mechanics'

/**
 * The optimizer: improves a drafted 99 one swap at a time. Each card keeps its place in the plan,
 * and a swap brings in a card that does that job better, so no job is ever left short. A job's
 * score includes the card's strength, its connections to the commander and key cards and, for the
 * theme, win conditions and engines, how well it works with the rest of the deck. The budget and
 * the bracket's rules (Game Changers, land destruction, extra turns, combos) are never broken.
 * Lands, key cards, pet cards, locked cards and wildcards stay. Same input, same deck.
 *
 * @packageDocumentation
 */

/** Optimizer options. */
export interface OptimizeOptions {
  /** What Commander Spellbook says about the candidates: Game Changers, land denial, extra turns, combos; null offline. */
  facts?: BracketFacts | null
  /** Most swaps, to keep it fast. */
  maxSwaps?: number
}

/** The optimized deck. */
export interface Optimized extends Draft {
  /** Swaps made. */
  swaps: number
  /** How good the deck is, before and after: higher is better. */
  value: number
  seedValue: number
}

/** Cards considered per job: the best by the pool's ranking. */
const PER_SLOT = 60
/** Weight of a card working with the rest of the deck, in places where connections matter. */
const PACKAGE_WEIGHT = 0.4
/** A mechanic with this many partners in the deck counts fully; fewer count partly. */
const PACKAGE_CAP = 4
/** Least gain for a swap to be worth it. */
const MIN_GAIN = 0.02
/** Default most swaps. */
const MAX_SWAPS = 300
/** Most passes over the deck. */
const MAX_PASSES = 6

/** A card the optimizer weighs. */
interface Candidate {
  entry: PoolCard
  key: string
  provides: Array<[MechanicId, number]>
  uses: Array<[MechanicId, number]>
  price: number
  gameChanger: boolean
  landDenial: boolean
  extraTurn: boolean
}

/** A place in the deck: a job of the plan, and the card filling it. */
interface Seat {
  slot: Slot
  key: string
  /** The draft's pick, kept as it was if the card stays. */
  pick: DeckPick
}

/**
 * Improves a draft by swapping its cards, each for a better one for the same job.
 * @param seed - The starting deck, usually {@link draftDeck}'s.
 */
export function optimizeDeck(pool: CandidatePool, seed: Draft, options: OptimizeOptions = {}): Optimized {
  const { brief, template } = pool
  const rules = BRACKET_RULES[brief.bracket]
  const facts = options.facts ?? null
  const flagged = (names: string[] | undefined) => new Set((names ?? []).map(nameKey))
  const spellbookChangers = flagged(facts?.gameChangers)
  const spellbookDenial = flagged(facts?.massLandDenial)
  const spellbookTurns = flagged(facts?.extraTurns)
  const slots = new Map(template.slots.map((slot) => [slot.id, slot]))

  const candidates = new Map<string, Candidate>()
  const candidate = (entry: PoolCard): Candidate => {
    const key = nameKey(entry.card.name)
    let c = candidates.get(key)
    if (!c) {
      const role = (id: RoleId) => entry.profile.roles.some((r) => r.id === id && r.weight >= 0.8)
      c = {
        entry,
        key,
        provides: entry.profile.provides.filter((s) => !s.via).map((s) => [s.id, s.weight]),
        uses: entry.profile.uses.map((s) => [s.id, s.weight]),
        price: entry.price ?? 0,
        gameChanger: entry.card.gameChanger === true || spellbookChangers.has(key),
        landDenial: role('land-denial') || spellbookDenial.has(key),
        extraTurn: role('extra-turn') || spellbookTurns.has(key)
      }
      candidates.set(key, c)
    }
    return c
  }
  /** The best cards for each job, in the pool's order. */
  const ranked = new Map<SlotId, Candidate[]>()
  for (const { slot, ranked: list } of pool.groups) {
    if (slot.id === 'land' || slot.id === 'wildcard') continue
    ranked.set(slot.id, list.filter((r) => r.score > 0).slice(0, Math.max(PER_SLOT, slot.count * 8)).map((r) => candidate(r.entry)))
  }

  // Cards that stay: lands, key cards, pets, locks and wildcards. The rest sit in seats that may change hands.
  const locked = new Set(brief.locks.map(nameKey))
  const petKeys = new Set(brief.pets.map(nameKey))
  const fixed = (pick: DeckPick) =>
    pick.slot === 'land' || pick.slot === 'wildcard' || locked.has(nameKey(pick.name)) || petKeys.has(nameKey(pick.name)) || /^(Your key card|Basic land)\./.test(pick.reason)
  const seats: Seat[] = []
  const members = new Set<string>()
  let spent = pool.commander.price ?? 0
  let gameChangers = pool.commander.card.gameChanger ? 1 : 0
  let landDenial = 0
  let extraTurns = 0
  const provided = new Map<string, number>()
  const used = new Map<string, number>()
  const add = (map: Map<string, number>, id: string, delta: number) => map.set(id, (map.get(id) ?? 0) + delta)
  for (const focus of pool.focus) {
    for (const s of focus.profile.provides) if (!s.via) add(provided, s.id, s.weight)
    for (const s of focus.profile.uses) add(used, s.id, s.weight)
  }
  const enter = (c: Candidate, sign: 1 | -1) => {
    for (const [id, w] of c.provides) add(provided, id, sign * w)
    for (const [id, w] of c.uses) add(used, id, sign * w)
    spent += sign * c.price
    if (c.gameChanger) gameChangers += sign
    if (c.landDenial) landDenial += sign
    if (c.extraTurn) extraTurns += sign
    if (sign > 0) members.add(c.key)
    else members.delete(c.key)
  }
  for (const pick of seed.picks) {
    const key = nameKey(pick.name)
    const entry = pool.eligible.get(key)
    const slot = slots.get(pick.slot)
    if (entry && slot && !fixed(pick)) {
      seats.push({ slot, key, pick })
      enter(candidate(entry), 1)
      continue
    }
    members.add(key)
    spent += priceOf(pool, pick.name) * pick.qty
    const card = entry?.card ?? pool.anchors.find((a) => nameKey(a.card.name) === key)?.card
    if (card?.gameChanger) gameChangers++
  }

  /** How well a card works with the rest of the deck, apart from what it adds itself. */
  const together = (c: Candidate) => {
    let score = 0
    for (const [id, w] of c.provides) score += w * Math.min(1, Math.max(0, (used.get(id) ?? 0) - (c.uses.find(([u]) => u === id)?.[1] ?? 0)) / PACKAGE_CAP)
    for (const [id, w] of c.uses) score += w * Math.min(1, Math.max(0, (provided.get(id) ?? 0) - (c.provides.find(([p]) => p === id)?.[1] ?? 0)) / PACKAGE_CAP)
    return Math.min(1, score)
  }
  /** A card's worth in a seat: its score for the job and, outside plain roles, how well it works with the deck. */
  const worth = (slot: Slot, c: Candidate) => (slotScore(slot, c.entry, pool) ?? 0) + (slot.role ? 0 : PACKAGE_WEIGHT * together(c))
  const total = () => seats.reduce((sum, seat) => sum + worth(seat.slot, candidates.get(seat.key)!), 0)

  // Bracket rules, and combos that would come together.
  const breaking = (facts?.combos ?? []).filter((combo) => comboBreaks(combo, brief.bracket))
  const focusKeys = pool.focus.map((f) => nameKey(f.name))
  const completesCombo = (key: string) =>
    breaking.some(
      (combo) => combo.cards.some((card) => nameKey(card) === key) && combo.cards.every((card) => nameKey(card) === key || members.has(nameKey(card)) || focusKeys.includes(nameKey(card)))
    )
  /** Whether a card may come in, the leaving card already out. */
  const fits = (c: Candidate) => {
    if (members.has(c.key)) return false
    if (brief.budget.total !== null && spent + c.price > brief.budget.total) return false
    if (rules.gameChangers !== null && c.gameChanger && gameChangers + 1 > rules.gameChangers) return false
    if (!rules.landDenial && c.landDenial) return false
    if (rules.extraTurns !== null && c.extraTurn && extraTurns + 1 > rules.extraTurns) return false
    return !completesCombo(c.key)
  }
  /** Whether a seated card breaks the bracket or the budget now. */
  const breaks = (c: Candidate) => {
    enter(c, -1)
    const broken = !fits(c)
    enter(c, 1)
    return broken
  }

  const seedValue = total()
  let swaps = 0
  const maxSwaps = options.maxSwaps ?? MAX_SWAPS
  /** Seats the card with the most gain, the current one out; keeps the current one if none gains. */
  const improve = (seat: Seat, mustLeave: boolean): boolean => {
    const out = candidates.get(seat.key)!
    enter(out, -1)
    const base = mustLeave ? -Infinity : worth(seat.slot, out)
    let best: { c: Candidate; gain: number } | null = null
    for (const c of ranked.get(seat.slot.id) ?? []) {
      if (c.key === out.key || !fits(c)) continue
      const gain = worth(seat.slot, c) - base
      if (gain > MIN_GAIN && (!best || gain > best.gain)) best = { c, gain }
    }
    if (!best) {
      if (!mustLeave) enter(out, 1)
      return false
    }
    enter(best.c, 1)
    seat.key = best.c.key
    seat.pick = { name: best.c.entry.card.name, qty: 1, slot: seat.slot.id, reason: pickReason(best.c.entry, seat.slot, pool) }
    swaps++
    return true
  }

  // Repair: cards breaking the bracket leave first, for the best cards that fit.
  for (const seat of [...seats]) {
    if (!breaks(candidates.get(seat.key)!)) continue
    if (!improve(seat, true)) seats.splice(seats.indexOf(seat), 1)
  }
  // Search: each seat's card, weakest first, for the best card that does its job better.
  for (let pass = 0, improved = true; improved && pass < MAX_PASSES && swaps < maxSwaps; pass++) {
    improved = false
    const order = [...seats].sort((a, b) => worth(a.slot, candidates.get(a.key)!) - worth(b.slot, candidates.get(b.key)!) || a.key.localeCompare(b.key))
    for (const seat of order) {
      if (swaps >= maxSwaps) break
      if (improve(seat, false)) improved = true
    }
  }

  // The deck: seats in the draft's order, then the cards that stayed.
  const seated = new Map(seats.map((seat) => [seat.pick.name, seat]))
  const picks: DeckPick[] = []
  for (const pick of seed.picks) {
    if (fixed(pick)) picks.push(pick)
  }
  const kept = new Set(picks.map((p) => p.name))
  const changed = [...seated.values()].map((seat) => seat.pick).filter((pick) => !kept.has(pick.name))
  const basics = picks.filter((pick) => /^Basic land\./.test(pick.reason))
  const others = picks.filter((pick) => !/^Basic land\./.test(pick.reason))
  const final = [...others, ...changed, ...basics]
  const filled = new Map<SlotId, number>()
  for (const pick of final) filled.set(pick.slot, (filled.get(pick.slot) ?? 0) + pick.qty)
  const short = template.slots
    .filter((slot) => slot.id !== 'land')
    .map((slot) => ({ slot: slot.id, missing: slot.count - (filled.get(slot.id) ?? 0) }))
    .filter((gap) => gap.missing > 0)
  return { picks: final, short, swaps, value: total(), seedValue }
}

/** EUR of a card in the deck, basics included. */
function priceOf(pool: CandidatePool, name: string): number {
  const key = nameKey(name)
  return pool.eligible.get(key)?.price ?? pool.basics.find((b) => nameKey(b.card.name) === key)?.price ?? pool.anchors.find((a) => nameKey(a.card.name) === key)?.price ?? 0
}
