import { PILLARS, routeChoice, type DeckBrief, type WinRoute } from './deckBrief'
import { MECHANICS, ROLES, type MechanicId, type RoleId, type Signal } from './mechanics'
import type { FocusCard } from './synergy'

/**
 * The 99-card plan: how many cards of each job a Commander deck needs (lands, ramp, removal…),
 * adjusted to the player's brief and to what the commander and key cards need. Every count says
 * why in plain words, so the player learns what a deck is made of.
 *
 * @packageDocumentation
 */

/** Cards besides the commander. */
export const DECK_CARDS = 99

/** Roles with a slot of their own. */
export const SLOT_ROLES = ['ramp', 'card-advantage', 'removal', 'board-wipe', 'counterspell', 'protection', 'tutor', 'evasion'] as const
/** Role with a slot of its own. */
export type SlotRole = (typeof SLOT_ROLES)[number]

/** A job in the deck: lands, a role, a way to win, the commander's theme, or wildcards. */
export type SlotId = 'land' | SlotRole | `route:${WinRoute}` | 'theme' | 'wildcard'

/** How many cards the deck plays for one job, and why. */
export interface Slot {
  id: SlotId
  label: string
  explain: string
  /** Jargon for it, if any. */
  term?: string
  /** Cards to pick for it. */
  count: number
  /** Why this many, in plain words: the usual count first, then each change. */
  why: string[]
  /** Role the cards fill; `land` for lands. */
  role?: RoleId
  /** Way to win the cards serve. */
  route?: WinRoute
  /** Lands only: most nonbasic lands; basics fill the rest. */
  nonbasic?: number
}

/** The plan. */
export interface DeckTemplate {
  /** Slots in picking order; counts add up to {@link DECK_CARDS}. */
  slots: Slot[]
  /** Mana value above which cards need a strong reason to be in the deck; null for any. */
  curveTop: number | null
}

/** Usual counts in a 99-card deck. */
const BASE: Record<'land' | SlotRole, number> = {
  land: 37,
  ramp: 10,
  'card-advantage': 10,
  removal: 8,
  'board-wipe': 3,
  counterspell: 0,
  protection: 2,
  tutor: 0,
  evasion: 0
}
/** Why the usual counts. */
const BASE_WHY: Record<'land' | SlotRole, string> = {
  land: 'Commander decks usually play 36 to 38 lands.',
  ramp: 'Most decks play about 10 cards that get extra mana early.',
  'card-advantage': 'About 10 cards that give you extra cards keep you from running out of things to do.',
  removal: 'About 8 answers to single threats.',
  'board-wipe': 'Two or three ways to clear the board when you fall behind.',
  counterspell: '',
  protection: 'A couple of ways to keep your commander and key cards safe.',
  tutor: '',
  evasion: ''
}
/** Game-winning cards most decks play, shared by the chosen routes. */
const FINISHERS = 6
/** Fewest cards left for the commander's theme. */
const MIN_THEME = 10
/** A key card needs a signal at least this strong to change the plan. */
const STRONG = 0.8
/** Nonbasic share of the lands by number of colors: one color needs few. */
const NONBASIC_SHARE = [0.15, 0.15, 0.35, 0.45, 0.5, 0.55]

/** Mechanics a land-hungry key card uses: it plays better with more lands. */
const LAND_HUNGRY: MechanicId[] = ['land-play', 'land-enters', 'land-count', 'type-plains', 'type-island', 'type-swamp', 'type-mountain', 'type-forest']

/** Strongest signal of a key card among `ids`, if strong enough to change the plan. */
function strong<T extends string>(signals: Array<Signal<T>>, ids: readonly T[]): Signal<T> | undefined {
  return signals.filter((s) => ids.includes(s.id) && s.weight >= STRONG).sort((a, b) => b.weight - a.weight)[0]
}

/** "Flubs, the Fool and Valakut, the Molten Pinnacle", "A, B and C". */
const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
/** "1 more land", "3 more lands". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Builds the plan for a brief.
 * @param focus - The commander, then the key cards, with what they do.
 * @param identity - The commander's color identity.
 */
export function deckTemplate(brief: DeckBrief, focus: FocusCard[], identity: string[]): DeckTemplate {
  const counts = { ...BASE }
  const whys = Object.fromEntries(Object.entries(BASE_WHY).map(([id, why]) => [id, why ? [why] : []])) as Record<keyof typeof BASE, string[]>
  const change = (id: keyof typeof BASE, delta: number, why: string) => {
    const next = Math.max(0, counts[id] + delta)
    if (next === counts[id]) return
    counts[id] = next
    whys[id].push(why)
  }
  let finishers = FINISHERS
  const finisherWhy: string[] = []

  // Pace
  if (brief.pace === 'fast') {
    change('land', -3, 'Quick start: cheap cards need fewer lands.')
    change('ramp', -2, 'Quick start: cheap cards need less extra mana.')
  } else if (brief.pace === 'big') {
    change('land', 1, 'Big turns: one more land for the expensive cards.')
    change('ramp', 3, 'Big turns: more extra mana, to cast expensive cards sooner.')
  }

  // What matters most
  const pillar = PILLARS[brief.pillar].label
  if (brief.pillar === 'interaction') {
    const blue = identity.includes('U')
    change('removal', blue ? 3 : 5, `${pillar} matters most to you: more removal.`)
    change('board-wipe', 1, `${pillar} matters most to you: one more board wipe.`)
    if (blue) change('counterspell', 3, `${pillar} matters most to you, and blue can stop spells as they are cast.`)
  } else if (brief.pillar === 'evasion') {
    change('evasion', 6, `${pillar} matters most to you: cards that get your creatures past blockers.`)
    change('protection', 2, `${pillar} matters most to you: keep your attackers alive.`)
  } else if (brief.pillar === 'resources') {
    change('ramp', 2, `${pillar} matter most to you: more extra mana.`)
    change('card-advantage', 3, `${pillar} matter most to you: more extra cards.`)
  } else {
    finishers += 4
    finisherWhy.push(`${pillar} matters most to you: more game-winning cards.`)
    change('tutor', 2, `${pillar} matters most to you: cards that find your winners.`)
  }

  // What the key cards need
  let extraLands = 0
  for (const { name, profile } of focus) {
    if (extraLands >= 3) break
    const hungry = strong(profile.uses, LAND_HUNGRY)
    const drops = strong(profile.provides, ['extra-land-drop'])
    if (!hungry && !drops) continue
    const n = extraLands === 0 ? 2 : 1
    extraLands += n
    const phrase = hungry ? MECHANICS[hungry.id].use : MECHANICS['extra-land-drop'].provide
    change('land', n, `${name} ${phrase}, so the deck plays ${plural(n, 'more land')} to keep it going.`)
  }
  const handEmptier = focus.find(({ profile }) => strong(profile.uses, ['empty-hand']))
  if (handEmptier) {
    change('card-advantage', -4, `${handEmptier.name} ${MECHANICS['empty-hand'].use}, so the deck plays fewer cards that draw a lot.`)
  }
  const drawer = focus.find(({ profile }) => strong(profile.roles, ['card-advantage']))
  if (drawer) change('card-advantage', -2, `${drawer.name} already gives you extra cards.`)
  const ramper = focus.find(({ profile }) => strong(profile.roles, ['ramp']))
  if (ramper) change('ramp', -2, `${ramper.name} already gets you extra mana.`)

  // Kinds of cards the player left out
  for (const role of brief.avoidRoles) {
    if ((SLOT_ROLES as readonly string[]).includes(role)) {
      counts[role as SlotRole] = 0
      whys[role as SlotRole] = ['You asked to leave these out.']
    }
  }

  // Ways to win share the game-winning cards.
  const routes = brief.routes
  const perRoute = routes.map((_, i) => Math.floor(finishers / routes.length) + (i < finishers % routes.length ? 1 : 0))
  let wildcards = brief.wildcards

  // Whatever is left plays the commander's theme; make room for at least a few.
  const fixed = () => Object.values(counts).reduce((sum, n) => sum + n, 0) + perRoute.reduce((sum, n) => sum + n, 0) + wildcards
  const wildcardWhy = wildcards > 0 ? [`You asked for ${plural(wildcards, 'wildcard')}.`] : []
  if (DECK_CARDS - fixed() < MIN_THEME && wildcards > 0) {
    const cut = Math.min(wildcards, MIN_THEME - (DECK_CARDS - fixed()))
    wildcards -= cut
    wildcardWhy.push(`${plural(cut, 'fewer wildcard')}, to leave room for cards that play your plan.`)
  }
  const trimmed = new Map<SlotRole, number>()
  while (DECK_CARDS - fixed() < MIN_THEME) {
    const largest = SLOT_ROLES.reduce((a, b) => (counts[b] > counts[a] ? b : a))
    if (counts[largest] === 0) break
    counts[largest]--
    trimmed.set(largest, (trimmed.get(largest) ?? 0) + 1)
  }
  for (const [role, n] of trimmed) whys[role].push(`${n} fewer, to fit everything in ${DECK_CARDS} cards.`)

  const focusNames = listNames(focus.map((f) => f.name))
  const nonbasic = Math.round(counts.land * NONBASIC_SHARE[Math.min(identity.length, NONBASIC_SHARE.length - 1)])
  const slots: Slot[] = [
    {
      id: 'land',
      ...ROLES.land,
      role: 'land',
      count: counts.land,
      why: [...whys.land, `Up to ${nonbasic} can be nonbasic lands that make more than one color or help your plan; basic lands fill the rest.`],
      nonbasic
    },
    ...routes.map((route, i): Slot => {
      const choice = routeChoice(route)
      return {
        id: `route:${route}`,
        ...choice,
        route,
        count: perRoute[i],
        why: [`A deck needs about ${finishers} cards that actually win; ${routes.length > 1 ? `this way to win gets ${perRoute[i]} of them` : 'all of them win this way'}.`, ...finisherWhy]
      }
    }),
    ...SLOT_ROLES.filter((role) => counts[role] > 0 || brief.avoidRoles.includes(role)).map(
      (role): Slot => ({ id: role, ...ROLES[role], role, count: counts[role], why: whys[role] })
    ),
    {
      id: 'theme',
      label: 'Your plan',
      explain: `Cards that work with ${focusNames}.`,
      count: 0,
      why: [`The rest of the deck: the cards that connect best to ${focusNames}.`]
    },
    ...(wildcards > 0 || wildcardWhy.length > 0
      ? [
          {
            id: 'wildcard' as const,
            label: 'Wildcards',
            explain: 'Surprising picks that connect to your plan in ways players rarely think of.',
            count: wildcards,
            why: wildcardWhy
          }
        ]
      : [])
  ]
  const theme = slots.find((slot) => slot.id === 'theme')!
  theme.count = DECK_CARDS - slots.reduce((sum, slot) => sum + slot.count, 0)
  return { slots, curveTop: brief.pace === 'fast' ? 4 : brief.pace === 'steady' ? 6 : null }
}
