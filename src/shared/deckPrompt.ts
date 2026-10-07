import { BOARDS, PACES, PILLARS, routeChoice, type DeckBrief } from './deckBrief'
import type { DeckCheck } from './deckCheck'
import type { DeckPick } from './deckDraft'
import { MIN_FIT, type CandidatePool, type PoolCard, type PoolGroup } from './deckPool'
import type { CardSearch } from './deckSearch'
import { plannedPicks, type SubmittedPick } from './deckSession'
import { DECK_CARDS, type Slot } from './deckTemplate'
import { MECHANICS } from './mechanics'
import { priceBasisLabel } from './pricing'

/**
 * What Claude reads when building or changing a deck: the instructions, the player's brief, the
 * plan, the shortlist, and the tools it uses to search cards and hand in the deck. Card lines are
 * compact, but carry what the app knows: cost, price, jobs, connections, warnings, rules text.
 *
 * @packageDocumentation
 */

/** Model that builds decks. */
export const DECK_MODEL = 'claude-sonnet-5-5'

/** Instructions for every build and change; the same for every deck, so they can be cached. */
export const SYSTEM_PROMPT = `You are the deckbuilding helper in MTG Dreams, a Magic: The Gathering collection app. You build a 99-card Commander deck for one player, following their brief and a plan the app made, and you explain every pick so a new or intermediate player learns from it.

How you work
- The app has read every card's rules text and knows prices, legality and the deck's colors. It gives you a shortlist for each slot of the plan, best first by its own ranking: how well a card does the slot's job and how it connects to the commander and key cards. That ranking can't judge how strong a card is; that is your job.
- You may pick any card the app reports as eligible: from the shortlist, found with search_cards, or confirmed with look_up_cards. Never pick a card you haven't seen in one of those. Use look_up_cards to check cards you know that might fit; use search_cards to find cards for a job or a connection.
- Hand in the deck with submit_deck. The app checks it: errors must be fixed; warnings deserve a second look. Basic lands are added automatically to reach 99 cards, so never pick them.

What makes a good pick
- Build around the commander first, then the key cards. A card that helps a key card but works against the commander does not belong; don't let the deck drift away from its commander.
- Every card should do its slot's job well and, where it can, connect to the commander or key cards. Prefer such cards over generic staples that only do the job. Popularity is never a reason.
- Judge strength: efficient mana value, flexible effects, effects that repeat over ones that happen once, cards that help the deck actually win.
- Stay within the budget. The app only offers cards within the per-card limit; keep the whole deck within the total.
- Avoid cards the app warns about (⚠): they work against the commander or a key card. Use one only if it clearly helps more than it hurts, and say why in its reason.
- Wildcards are surprising picks that connect to the plan in a way the player wouldn't think of. Explain the trick.
- Follow the plan's counts closely (one more or fewer per slot is fine) and keep the land count near the plan.

How you explain
- Write each reason in one or two plain sentences, under 35 words, for a player who doesn't know the jargon: what the card does in this deck and how it works with the commander or key cards. The first time you use a term players will hear (ramp, landfall, card advantage…), explain it in passing.
- The deck summary explains in 3 to 5 sentences how the deck plays and how it wins.`

/** "Flubs" from "Flubs, the Fool": short name of a commander or key card. */
const short = (name: string) => name.split(/,| \/\/ /)[0]
/** "€12.50". */
const eur = (value: number) => `€${value.toFixed(2)}`
/** Longest rules text quoted per card. */
const MAX_TEXT = 400

/**
 * One card in a compact line: name, mana cost, type, price, jobs, connections, warnings, rules text.
 * e.g. `Molten Vortex {R} · Enchantment · €0.24 · jobs: removal, burn · links: feeds Flubs (empty hand) · “{R}, Discard a land card: …”`
 */
export function cardLine(entry: PoolCard): string {
  const { card } = entry
  const parts = [`${card.name}${card.manaCost ? ` ${card.manaCost}` : ''}`, card.typeLine, entry.price === null ? 'no price' : eur(entry.price)]
  const jobs = entry.profile.roles.filter((r) => r.id !== 'land' && r.weight >= MIN_FIT).map((r) => r.id)
  if (jobs.length > 0) parts.push(`jobs: ${jobs.join(', ')}`)
  const links = entry.links
    .slice(0, 3)
    .map((l) => `${l.direction === 'feeds' ? 'feeds' : 'fed by'} ${short(l.focus)} (${MECHANICS[l.mechanic].label.toLowerCase()})`)
  if (links.length > 0) parts.push(`links: ${links.join('; ')}`)
  for (const c of entry.conflicts) parts.push(`⚠ against ${short(c.focus)}: ${MECHANICS[c.mechanic].stop ?? `works against ${MECHANICS[c.mechanic].label.toLowerCase()}`}`)
  const text = card.text.replace(/\s*\n\s*/g, ' / ')
  if (text) parts.push(`“${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text}”`)
  return parts.join(' · ')
}

/** The brief in plain words. */
function briefSection(brief: DeckBrief, pool: CandidatePool): string[] {
  const lines = ['# The player’s brief', `- Commander: ${brief.commander}`]
  if (brief.anchors.length > 0) lines.push(`- Key cards, always in the deck: ${brief.anchors.join('; ')}`)
  lines.push(`- What matters most: ${PILLARS[brief.pillar].label} (${PILLARS[brief.pillar].explain.toLowerCase().replace(/\.$/, '')})`)
  const routes = brief.routes.map((route) => {
    const choice = routeChoice(route)
    return `${choice.label}${choice.term ? ` (${choice.term})` : ''}`
  })
  lines.push(`- Ways to win: ${routes.length > 0 ? routes.join('; ') : 'none chosen; play to the commander’s strengths'}`)
  const curve = pool.template.curveTop === null ? '' : `; keep most cards at mana value ${pool.template.curveTop} or less`
  lines.push(`- Pace: ${PACES[brief.pace].label} (${PACES[brief.pace].explain.toLowerCase().replace(/\.$/, '')})${curve}`)
  lines.push(`- Board: ${BOARDS[brief.board].label} (${BOARDS[brief.board].explain.toLowerCase().replace(/\.$/, '')})`)
  if (brief.pets.length > 0) lines.push(`- Pet cards, include them if they fit: ${brief.pets.join('; ')}`)
  const avoid = [...brief.avoid, ...brief.avoidRoles.map((role) => `${role} cards`)]
  if (avoid.length > 0) lines.push(`- Leave out: ${avoid.join('; ')}`)
  const { total, perCard, basis } = brief.budget
  const fixed = [pool.commander, ...pool.anchors].reduce((sum, e) => sum + (e.price ?? 0), 0)
  const budget = [
    total === null ? 'no limit for the whole deck' : `${eur(total)} for the whole deck, commander included; the commander and key cards cost ${eur(fixed)}, leaving ${eur(Math.max(0, total - fixed))}`,
    perCard === null ? 'no limit per card' : `at most ${eur(perCard)} per card`
  ]
  lines.push(`- Budget: ${budget.join('; ')}. Prices are Cardmarket’s ${priceBasisLabel(basis).toLowerCase()} price.`)
  lines.push(`- Wildcards wanted: ${brief.wildcards}`)
  return lines
}

/** The commander and key cards with what the app read from them. */
function focusSection(pool: CandidatePool): string[] {
  return ['# Commander and key cards', ...[pool.commander, ...pool.anchors].map((entry) => `- ${cardLine(entry)}`)]
}

/** The plan with each slot's id, count and reasons. */
function planSection(pool: CandidatePool): string[] {
  const { spells, nonbasicLands } = plannedPicks(pool)
  const lines = [`# The plan: ${DECK_CARDS} cards besides the commander`]
  for (const slot of pool.template.slots) lines.push(`- \`${slot.id}\` ${slot.label}: ${slot.count}. ${slot.why.join(' ')}`)
  const keyCards = pool.anchors.length > 0 ? 'The key cards are added for you and already count toward their slots. ' : ''
  lines.push(
    '',
    `Pick ${spells} spells for the slots besides \`land\`, and up to ${nonbasicLands} nonbasic lands for \`land\`. ${keyCards}Basic lands are added for you to fill the rest of the ${DECK_CARDS}.`
  )
  return lines
}

/** A slot's heading in the shortlist. */
const slotHeading = (slot: Slot) => `## \`${slot.id}\` ${slot.label} — pick ${slot.id === 'land' ? `up to ${slot.nonbasic ?? slot.count} nonbasic` : slot.count}`

/** First message of a build: brief, key cards, plan and shortlist. */
export function buildMessage(pool: CandidatePool, offered: PoolGroup[]): string {
  const lines = [...briefSection(pool.brief, pool), '', ...focusSection(pool), '', ...planSection(pool), '']
  lines.push(
    '# Shortlist',
    'Ranked by the app’s reading of rules text (job and connections), not by strength. Each card appears once, under the first slot it fits; many fit several. Search for more whenever a slot needs it.',
    ''
  )
  for (const { slot, ranked } of offered) {
    lines.push(slotHeading(slot), ...ranked.map(({ entry }) => `- ${cardLine(entry)}`), '')
  }
  lines.push('Build the deck, then hand it in with submit_deck.')
  return lines.join('\n')
}

/**
 * First message of a change: brief, plan, the deck as it is with its warnings, and the player's
 * request, which may also be a question.
 */
export function changeMessage(pool: CandidatePool, deck: DeckPick[], summary: string, check: DeckCheck, request: string): string {
  const lines = [...briefSection(pool.brief, pool), '', ...focusSection(pool), '', ...planSection(pool), '', '# The deck as it is']
  if (summary) lines.push(summary, '')
  for (const pick of deck) lines.push(`- ${pick.qty > 1 ? `${pick.qty} ` : ''}${pick.name} (\`${pick.slot}\`) — ${pick.reason}`)
  const issues = check.issues.filter((issue) => issue.severity !== 'note')
  if (issues.length > 0) lines.push('', 'The app’s current warnings:', ...issues.map((issue) => `- ${issue.message}`))
  lines.push(
    '',
    '# The player asks',
    request.trim(),
    '',
    'Make the change with change_deck, searching or looking up cards as needed. If the player asks a question, or no change is needed, call change_deck with nothing to remove or add and answer in its notes.'
  )
  return lines.join('\n')
}

/** Schema of picked cards in tool inputs. */
const PICKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact card name, as the app shows it.' },
      slot: { type: 'string', description: 'Slot id from the plan, e.g. `ramp` or `route:burn`.' },
      reason: { type: 'string', description: 'Why it is in the deck, for the player: one or two plain sentences, under 35 words.' }
    },
    required: ['name', 'slot', 'reason']
  }
}

/** Tools for searching cards. */
const SEARCH_TOOLS = [
  {
    name: 'search_cards',
    description:
      'Search every card eligible for this deck: legal, in the commander’s colors, within the per-card limit, not left out by the player. Returns the best matches first: ranked for a slot when you give one, otherwise by how strongly they connect to the commander and key cards. Cards already in the deck are left out when changing a deck.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words that must all appear in the name, type line or rules text, e.g. `landfall damage`; put a phrase in double quotes to match it exactly.' },
        slot: { type: 'string', description: 'Slot id from the plan to rank by; only cards that do that job are returned.' },
        type: { type: 'string', description: 'A type the card must have, e.g. `Creature`, `Instant`, `Land`.' },
        max_price: { type: 'number', description: 'Most a card may cost, in EUR.' },
        max_mana_value: { type: 'number', description: 'Highest mana value.' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Most results; 15 if not given.' }
      }
    }
  },
  {
    name: 'look_up_cards',
    description: 'Look up cards by exact name. Says for each whether it can be picked for this deck, with what the app knows about it, or why not.',
    input_schema: {
      type: 'object',
      properties: { names: { type: 'array', items: { type: 'string' }, maxItems: 20 } },
      required: ['names']
    }
  }
]

/** Tools for building a deck. */
export const BUILD_TOOLS = [
  ...SEARCH_TOOLS,
  {
    name: 'submit_deck',
    description: `Hand in the whole deck: every card besides the commander and basic lands, each with its slot and reason. The app adds basic lands to reach ${DECK_CARDS} and checks the deck. If it finds errors, fix them and submit the whole deck again.`,
    input_schema: {
      type: 'object',
      properties: {
        picks: PICKS_SCHEMA,
        summary: { type: 'string', description: 'How the deck plays and wins, in 3 to 5 plain sentences.' },
        notes: { type: 'string', description: 'Optional: warnings you chose to keep, and why.' }
      },
      required: ['picks', 'summary']
    }
  },
  {
    name: 'change_deck',
    description: 'After submit_deck: swap cards in the deck you handed in. The app re-checks the deck.',
    input_schema: {
      type: 'object',
      properties: {
        remove: { type: 'array', items: { type: 'string' }, description: 'Names of cards to take out.' },
        add: PICKS_SCHEMA,
        notes: { type: 'string', description: 'What you changed and why.' }
      },
      required: ['remove', 'add']
    }
  },
  {
    name: 'finish_deck',
    description: 'Accept the deck as handed in, keeping any remaining warnings.',
    input_schema: {
      type: 'object',
      properties: { notes: { type: 'string', description: 'Warnings you chose to keep, and why, for the player.' } }
    }
  }
]

/** Tools for changing a finished deck. */
export const CHANGE_TOOLS = [
  ...SEARCH_TOOLS,
  {
    name: 'change_deck',
    description: 'Change the deck: take cards out and put cards in. Basic lands adjust automatically. The app re-checks the deck; fix any errors it reports.',
    input_schema: {
      type: 'object',
      properties: {
        remove: { type: 'array', items: { type: 'string' }, description: 'Names of cards to take out.' },
        add: PICKS_SCHEMA,
        summary: { type: 'string', description: 'The deck summary again, only if the change alters how the deck plays.' },
        notes: { type: 'string', description: 'For the player: what you changed and why, or the answer to their question.' }
      },
      required: ['remove', 'add', 'notes']
    }
  }
]

/** Longest reason kept. */
const MAX_REASON = 400
/** Most names per look-up. */
const MAX_LOOK_UPS = 20

/** A string, trimmed and cut to `max`; empty if not a string. */
const str = (value: unknown, max = 1000) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** @returns Picks from a tool input, and what's wrong with any that can't be read. */
export function readPicks(raw: unknown, pool: CandidatePool): { picks: SubmittedPick[]; problems: string[] } {
  const slots = new Set<string>(pool.template.slots.map((slot) => slot.id))
  const picks: SubmittedPick[] = []
  const problems: string[] = []
  if (!Array.isArray(raw)) return { picks, problems: ['The picks must be a list of cards.'] }
  for (const item of raw) {
    const name = str(item?.name, 200)
    const slot = str(item?.slot, 60)
    if (!name) {
      problems.push('A pick has no card name.')
      continue
    }
    if (!slots.has(slot)) {
      problems.push(`${name} has slot “${slot}”, which isn't in the plan. Slots: ${[...slots].join(', ')}.`)
      continue
    }
    picks.push({ name, slot: slot as Slot['id'], reason: str(item?.reason, MAX_REASON) || 'Fits the plan.' })
  }
  return { picks, problems }
}

/** @returns A search from a tool input. */
export function readSearch(raw: any): CardSearch {
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  return {
    text: str(raw?.text, 200) || undefined,
    slot: str(raw?.slot, 60) || undefined,
    type: str(raw?.type, 40) || undefined,
    maxPrice: num(raw?.max_price),
    maxManaValue: num(raw?.max_mana_value),
    limit: num(raw?.limit)
  }
}

/** @returns Names from a look-up tool input, at most {@link MAX_LOOK_UPS}. */
export function readNames(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).map((name) => str(name, 200)).filter(Boolean).slice(0, MAX_LOOK_UPS)
}

/** @returns A text field from a tool input. */
export const readText = (raw: unknown) => str(raw, 3000)
