import { BRACKETS, engineChoice, interactionOf, paceOf, STRATEGIES, winconChoice, type BracketId, type DeckBrief, type WinconId } from './deckBrief'
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

/**
 * A job in the deck: lands, a role, a way to win, an engine of the commander's to multiply, the
 * rest of the commander's theme, or wildcards.
 */
export type SlotId = 'land' | SlotRole | `wincon:${WinconId}` | `engine:${MechanicId}` | 'theme' | 'wildcard'

/** How many cards the deck plays for one job, and why. */
export interface Slot {
  id: SlotId
  /** What players call it: "Ramp", "Landfall". */
  label: string
  /** The same in plain words, when the label is jargon. */
  plain?: string
  explain: string
  /** Cards to pick for it. */
  count: number
  /** Why this many, in plain words: the usual count first, then each change. */
  why: string[]
  /** Role the cards fill; `land` for lands. */
  role?: RoleId
  /** Way to win the cards serve. */
  wincon?: WinconId
  /** Mechanic the cards do or reward. */
  engine?: MechanicId
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
/** Game-winning cards most decks play, shared by the chosen ways to win. */
const FINISHERS = 8
/** Cards that multiply the commander's engines, shared by the chosen engines. */
const ENGINE_CARDS = 10
/** Tutors by bracket: none for casual tables, more as power rises. */
const BRACKET_TUTORS: Record<BracketId, number> = { 1: 0, 2: 1, 3: 2, 4: 4, 5: 6 }
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

/**
 * A slot in plain words from its id alone, e.g. for showing a saved deck without its plan.
 * @returns Label, explanation and jargon.
 */
export function slotInfo(id: SlotId): { label: string; plain?: string; explain: string } {
  if (id === 'theme') return { label: 'Synergy', plain: 'Your plan', explain: 'Cards that work with your commander and key cards.' }
  if (id === 'wildcard') return { label: 'Wildcards', plain: 'Surprising picks', explain: 'Cards that connect to your plan in ways players rarely think of.' }
  if (id.startsWith('wincon:')) return winconChoice(id.slice('wincon:'.length) as WinconId)
  if (id.startsWith('engine:')) {
    const engine = engineChoice(id.slice('engine:'.length) as MechanicId)
    return { ...engine, explain: `More cards that do this, and cards that reward it. ${engine.explain}` }
  }
  return ROLES[id as RoleId] ?? { label: id, explain: '' }
}

/** "Flubs, the Fool and Valakut, the Molten Pinnacle", "A, B and C". */
const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)
/** "1 more land", "3 more lands". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** Splits `total` cards between `n` parts, the first ones getting any left over. */
const share = (total: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0))

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
  const blue = identity.includes('U')
  const pace = paceOf(brief)
  const strategy = brief.strategy && STRATEGIES[brief.strategy].label

  // Pace, from the strategy
  if (pace === 'fast') {
    change('land', -3, `${strategy}: cheap cards need fewer lands.`)
    change('ramp', -2, `${strategy}: cheap cards need less extra mana.`)
  } else if (pace === 'big') {
    change('land', 1, `${strategy}: one more land for the expensive cards.`)
    change('ramp', 3, `${strategy}: more extra mana, to cast expensive cards sooner.`)
  }

  // How much the deck interacts
  const interaction = interactionOf(brief)
  const level = brief.interaction === 'auto' && strategy ? `${strategy} decks interact` : 'You interact'
  if (interaction === 'light') {
    change('removal', -3, `${level} lightly: fewer answers, more room for your own plan.`)
    change('board-wipe', -1, `${level} lightly: one board wipe fewer.`)
  } else if (interaction === 'heavy') {
    change('removal', blue ? 3 : 5, `${level} heavily: more removal.`)
    change('board-wipe', 1, `${level} heavily: one more board wipe.`)
    if (blue) change('counterspell', 4, `${level} heavily, and blue can stop spells as they are cast.`)
  } else if (blue) {
    change('counterspell', 2, 'Blue can stop spells as they are cast: a couple of counterspells.')
  }

  // Power level: stronger tables find their best cards on purpose.
  const tutors = BRACKET_TUTORS[brief.bracket]
  if (tutors > 0) change('tutor', tutors, `Bracket ${brief.bracket} · ${BRACKETS[brief.bracket].label}: ${plural(tutors, 'tutor')} to find your best cards.`)

  // What the ways to win need besides their own cards
  if (brief.wincons.includes('voltron')) {
    change('protection', 2, 'One huge threat needs to stay alive: more protection.')
    change('evasion', 3, 'One huge threat has to get through: cards that get it past blockers.')
  }
  if (brief.wincons.includes('beatdown')) change('evasion', 3, 'Beatdown: cards that get your attackers past blockers.')
  if (brief.wincons.includes('infect')) change('evasion', 3, 'Infect works through combat damage: cards that get your creatures past blockers.')
  if (brief.wincons.includes('combo')) change('tutor', 3, 'Combo: cards that find the pieces.')

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

  // Ways to win share the game-winning cards; engines share the cards that multiply them.
  const wincons = brief.wincons
  const perWincon = share(wincons.length > 0 ? FINISHERS : 0, wincons.length)
  const engines = brief.engines
  const perEngine = share(engines.length > 0 ? ENGINE_CARDS : 0, engines.length)
  let wildcards = brief.wildcards

  // Whatever is left plays the commander's theme; make room for at least a few.
  const sum = (ns: number[]) => ns.reduce((total, n) => total + n, 0)
  const fixed = () => sum(Object.values(counts)) + sum(perWincon) + sum(perEngine) + wildcards
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
  /** "Toph, the First Metalbender does", "A and B do": the key cards behind an engine. */
  const doers = (mechanic: MechanicId) => {
    const names = focus.filter(({ profile }) => [...profile.provides, ...profile.uses].some((s) => s.id === mechanic)).map((f) => f.name)
    return names.length > 1 ? `${listNames(names)} do` : `${names[0] ?? focusNames} does`
  }
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
    ...wincons.map(
      (wincon, i): Slot => ({
        id: `wincon:${wincon}`,
        ...winconChoice(wincon),
        wincon,
        count: perWincon[i],
        why: [`A deck needs about ${FINISHERS} cards that actually win; ${wincons.length > 1 ? `this way to win gets ${perWincon[i]} of them` : 'all of them win this way'}.`]
      })
    ),
    ...engines.map(
      (engine, i): Slot => ({
        id: `engine:${engine}`,
        ...slotInfo(`engine:${engine}`),
        engine,
        count: perEngine[i],
        why: [`${perEngine[i]} cards that do this too, or reward it, to multiply what ${doers(engine)}.`]
      })
    ),
    ...SLOT_ROLES.filter((role) => counts[role] > 0 || brief.avoidRoles.includes(role)).map(
      (role): Slot => ({ id: role, ...ROLES[role], role, count: counts[role], why: whys[role] })
    ),
    {
      id: 'theme',
      ...slotInfo('theme'),
      explain: `Cards that work with ${focusNames}.`,
      count: 0,
      why: [`The rest of the deck: the cards that connect best to ${focusNames}.`]
    },
    ...(wildcards > 0 || wildcardWhy.length > 0 ? [{ id: 'wildcard' as const, ...slotInfo('wildcard'), count: wildcards, why: wildcardWhy }] : [])
  ]
  const theme = slots.find((slot) => slot.id === 'theme')!
  theme.count = DECK_CARDS - slots.reduce((total, slot) => total + slot.count, 0)
  return { slots, curveTop: pace === 'fast' ? 4 : pace === 'steady' ? 6 : null }
}
