import {
  BASIC_TYPES,
  typeId,
  SUBTYPE_FORMS,
  SUBTYPE_RE,
  SUBTYPE_TOKEN_RE,
  SUBTYPE_BECOMES_RE,
  ABILITY_NAME_RE,
  TRAILING_SUBTYPES_RE,
  SUBTYPE_SKIP_RE,
  SUBTYPE_PARENTS,
  OTHERS_DISCARD_RE,
  YOU_DISCARD_RE,
  DRAWBACK_RE,
  DETECTORS,
  facesOf,
  hasType,
  isSpell,
  sentences,
  netDraw,
  discardCost,
  type Facts,
  type Part,
  type Side
} from './detectors'
import { parseAbilities, type Ability } from './oracleText'
import { CREATURE_TYPE_IDS, type MechanicId, type RoleId, type Signal, type CardProfile, type ReadableCard } from './vocabulary'

/**
 * Reads what a card does from its rules text: the game resources and events it **provides** (makes
 * happen), **uses** (benefits from) and **stops** (turns off), plus its deck **roles** (ramp,
 * removal…). Every finding keeps the line of rules text it came from, so any judgment can be
 * explained by quoting the card. No third-party tags or popularity data are involved. Its words are
 * in `vocabulary.ts`, its patterns in `detectors.ts`.
 *
 * @packageDocumentation
 */

/** Adds a signal, keeping the strongest per id. */
function add<T extends string>(list: Array<Signal<T>>, signal: Signal<T>): void {
  const existing = list.findIndex((s) => s.id === signal.id)
  if (existing < 0) list.push(signal)
  else if (signal.weight > list[existing].weight) list[existing] = signal
}

/** Mechanics a provided mechanic leads to, with how strongly. */
const PROVIDE_IMPLIES: Partial<Record<MechanicId, Array<[MechanicId, number]>>> = {
  'extra-land-drop': [['land-play', 1]],
  'land-play': [['land-enters', 1]],
  'land-enters': [['land-count', 0.5]],
  'land-leaves': [['lands-in-graveyard', 1]],
  'lands-in-graveyard': [['graveyard', 1]],
  discard: [['graveyard', 0.5], ['lands-in-graveyard', 0.5]],
  'creature-tokens': [['creature-enters', 0.7]],
  treasure: [['artifacts', 0.8]]
}

/** Keywords and ability words that use or provide a mechanic. */
const KEYWORDS: Array<{ keywords: string[]; side: Side; id: MechanicId | RoleId; weight: number }> = [
  { keywords: ['madness'], side: 'uses', id: 'discard', weight: 0.8 },
  { keywords: ['cycling'], side: 'provides', id: 'discard', weight: 0.6 },
  { keywords: ['landfall'], side: 'uses', id: 'land-enters', weight: 1 },
  { keywords: ['hellbent'], side: 'uses', id: 'empty-hand', weight: 1 },
  { keywords: ['flashback', 'escape', 'unearth', 'retrace', 'jump-start', 'embalm', 'eternalize', 'disturb', 'aftermath', 'delirium', 'threshold', 'scavenge', 'encore'], side: 'uses', id: 'graveyard', weight: 0.8 },
  { keywords: ['dredge'], side: 'provides', id: 'graveyard', weight: 1 },
  { keywords: ['lifelink'], side: 'provides', id: 'lifegain', weight: 0.7 },
  { keywords: ['infect', 'toxic', 'poisonous'], side: 'provides', id: 'poison', weight: 1 },
  { keywords: ['corrupted'], side: 'uses', id: 'poison', weight: 1 },
  { keywords: ['flying'], side: 'provides', id: 'flying', weight: 0.6 },
  { keywords: ['cascade', 'discover'], side: 'provides', id: 'cascade', weight: 1 },
  { keywords: ['defender'], side: 'provides', id: 'toughness', weight: 0.8 },
  { keywords: ['wither', 'infect'], side: 'provides', id: 'minus-counters', weight: 0.8 },
  { keywords: ['earthbend', 'airbend', 'waterbend', 'firebending'], side: 'provides', id: 'bending', weight: 1 },
  // Keyword actions whose reminder text is what they do.
  { keywords: ['explore'], side: 'provides', id: 'counters', weight: 0.8 },
  { keywords: ['connive'], side: 'provides', id: 'discard', weight: 0.8 },
  { keywords: ['amass'], side: 'provides', id: 'creature-tokens', weight: 0.8 },
  { keywords: ['amass'], side: 'provides', id: 'counters', weight: 0.8 },
  { keywords: ['mobilize'], side: 'provides', id: 'creature-tokens', weight: 1 },
  { keywords: ['offspring', 'populate', 'myriad'], side: 'provides', id: 'creature-tokens', weight: 0.8 },
  { keywords: ['offspring', 'populate', 'myriad'], side: 'provides', id: 'copies', weight: 0.8 },
  { keywords: ['blitz'], side: 'provides', id: 'creature-dies', weight: 0.8 },
  { keywords: ['ninjutsu', 'commander ninjutsu'], side: 'uses', id: 'attacking', weight: 0.8 },
  { keywords: ['changeling'], side: 'provides', id: 'tribe-any', weight: 0.6 },
  { keywords: ['deathtouch'], side: 'provides', id: 'deathtouch', weight: 0.6 },
  { keywords: ['flying', 'trample', 'menace', 'shadow', 'horsemanship', 'skulk', 'fear', 'intimidate'], side: 'roles', id: 'evasion', weight: 0.5 }
]

/** Abilities that are only mana, an entry condition, or a keyword line: not a land's "special" ability. */
const PLAIN_LAND_ABILITY_RE =
  /^(?:Add\b|This (?:land )?enters tapped|this enters tapped|As this (?:land )?enters|If you control two or fewer other lands|[A-Z][a-z]*cycling\b|Cycling\b|Indestructible$)/

/** @returns The card's profile: what it provides, uses and stops, and its deck roles. */
export function readCard(card: ReadableCard): CardProfile {
  const faces = facesOf(card.typeLine)
  const abilities = parseAbilities(card.name, card.text)
  const facts: Facts = {
    card,
    faces,
    land: faces[0].types.includes('Land'),
    keywords: new Set(card.keywords.map((k) => k.toLowerCase())),
    spellDiscards: abilities.reduce((sum, a) => sum + (a.kind === 'static' ? discardCost(a) : 0), 0)
  }
  const profile: CardProfile = { provides: [], uses: [], stops: [], roles: [] }

  for (const ability of abilities) {
    const parts: Record<Part, string> = {
      trigger: ability.trigger ?? '',
      cost: ability.cost ?? '',
      effect: ability.effect
    }
    for (const detector of DETECTORS) {
      if (detector.only && !detector.only(facts, ability)) continue
      if (detector.side === 'uses' && ability.kind === 'triggered' && DRAWBACK_RE.test(ability.effect)) continue
      const hit = detector.in.some((part) =>
        (detector.whole ? [parts[part]] : sentences(parts[part])).some(
          (sentence) => detector.all.every((re) => re.test(sentence)) && !detector.unless?.test(sentence)
        )
      )
      if (hit) add(profile[detector.side] as Signal<string>[], { id: detector.id, weight: detector.weight ?? 1, evidence: ability.text })
    }
    const ownDiscard = ability.effect.replace(OTHERS_DISCARD_RE, '')
    if (YOU_DISCARD_RE.test(ownDiscard)) add(profile.provides, { id: 'discard', weight: 1, evidence: ability.text })
    readLandTypes(ability, profile)
    readHandSize(facts, ability, profile)
  }

  for (const { keywords, side, id, weight } of KEYWORDS) {
    const keyword = keywords.find((k) => facts.keywords.has(k))
    if (keyword) add(profile[side] as Signal<string>[], { id, weight, evidence: titleCase(keyword) })
  }
  readTypeLine(facts, abilities, profile)
  readSubtypes(facts, abilities, profile)
  readRolesFromMechanics(facts, abilities, profile)
  for (const signal of profile.provides) {
    if (MASS_MECHANICS.has(signal.id) && MASS_RE.test(signal.evidence)) signal.mass = true
  }
  addImplied(profile)
  return profile
}

/** Land mechanics that can happen to all your lands at once. */
const MASS_MECHANICS = new Set<MechanicId>([
  'land-enters', 'land-leaves', 'lands-in-graveyard', ...BASIC_TYPES.map(([type]) => typeId(type))
])
/** Rules text acting on all your lands at once. */
const MASS_RE = /\blands you control are every basic land type\b|\b(?:all|any number of)\b[^.]*\blands?\b/i

/** Capitalizes a keyword for display. */
const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** Basic land types the card gives you or counts. */
function readLandTypes(ability: Ability, profile: CardProfile): void {
  const text = `${ability.trigger ?? ''} ${ability.effect}`
  const searches = /\bsearch your library for\b/i.test(ability.effect)
  // A land put into your hand still has to be played: later, and it uses a land drop.
  const toHand = /\binto your hand\b/i.test(ability.effect) && !/\bonto the battlefield\b/i.test(ability.effect)
  for (const [type, plural] of BASIC_TYPES) {
    const id = typeId(type)
    const evidence = ability.text
    // Searching for a basic or any land finds this type whenever the deck wants it to.
    if (searches && new RegExp(`\\b${type}\\b`).test(ability.effect)) add(profile.provides, { id, weight: toHand ? 0.6 : 1, evidence })
    else if (searches && /\bbasic land\b|\bland cards?\b/i.test(ability.effect)) add(profile.provides, { id, weight: toHand ? 0.5 : 0.8, evidence })
    // Lands returning to the battlefield bring back whatever types they have.
    else if (/\bland cards?\b[^.]*\b(?:onto|to) the battlefield\b/i.test(ability.effect)) add(profile.provides, { id, weight: 0.5, evidence })
    if (/\bevery basic land type\b/i.test(ability.effect)) add(profile.provides, { id, weight: 1, evidence })
    if (new RegExp(`\\b(?:are|is an?|become|becomes an?) ${plural === type ? type : `(?:${type}|${plural})`}\\b`).test(ability.effect)) {
      add(profile.provides, { id, weight: 0.5, evidence })
    }
    const counts = new RegExp(
      `\\b(?:${type}|${plural}) you control\\b|\\bfor each ${type}\\b|\\bother ${plural}\\b|\\bcontrol (?:a|an|\\w+|at least \\w+)(?: other)? (?:${type}|${plural})\\b`
    )
    // "Enters tapped unless you control a Mountain" only helps the land itself a little.
    if (!searches && counts.test(text)) add(profile.uses, { id, weight: /\benters tapped unless\b/i.test(text) ? 0.3 : 1, evidence })
  }
}

/** Draws that fill your hand, which turn off empty-hand payoffs. */
function readHandSize(facts: Facts, ability: Ability, profile: CardProfile): void {
  const net = netDraw(facts, ability)
  if (net >= 2) add(profile.stops, { id: 'empty-hand', weight: 1, evidence: ability.text })
  else if (net === 1) {
    // One card at a time only adds up when it repeats on its own (a forced trigger).
    const weight = ability.kind === 'triggered' || isSpell(facts) ? 0.3 : 0
    if (weight > 0) add(profile.stops, { id: 'empty-hand', weight, evidence: ability.text })
  }
}

/** Findings from the type line and keywords: land types, special lands, card types. */
function readTypeLine(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const { card } = facts
  const landFaces = facts.faces.filter((f) => f.types.includes('Land'))
  for (const [type] of BASIC_TYPES) {
    if (landFaces.some((f) => f.subtypes.includes(type))) add(profile.provides, { id: typeId(type), weight: 1, evidence: card.typeLine })
  }
  // Landcycling finds a land to play; Mountaincycling a Mountain.
  for (const keyword of facts.keywords) {
    const cycling = /^(basic land|land|plains|island|swamp|mountain|forest)cycling$/.exec(keyword)
    if (!cycling) continue
    const evidence = titleCase(keyword)
    for (const [type] of BASIC_TYPES) {
      if ([type.toLowerCase(), 'basic land', 'land'].includes(cycling[1])) add(profile.provides, { id: typeId(type), weight: 0.5, evidence })
    }
    add(profile.provides, { id: 'land-play', weight: 0.5, evidence })
  }
  if (facts.land && !facts.faces[0].types.includes('Basic')) {
    const special = abilities.find((a) => a.kind === 'triggered' || !PLAIN_LAND_ABILITY_RE.test(a.effect || a.text))
    if (special) add(profile.provides, { id: 'nonbasic-utility', weight: 1, evidence: special.text })
  }
  if (facts.land) add(profile.roles, { id: 'land', weight: 1, evidence: card.typeLine })
  else if (landFaces.length > 0) add(profile.roles, { id: 'land', weight: 0.5, evidence: card.typeLine })
  const front = facts.faces[0].types
  if (front.includes('Instant') || front.includes('Sorcery')) add(profile.provides, { id: 'instants-sorceries', weight: 0.5, evidence: card.typeLine })
  if (front.includes('Artifact')) add(profile.provides, { id: 'artifacts', weight: 0.6, evidence: card.typeLine })
  if (front.includes('Enchantment')) add(profile.provides, { id: 'enchantments', weight: 0.6, evidence: card.typeLine })
  if (hasType(facts, 'Equipment') || hasType(facts, 'Aura')) add(profile.provides, { id: 'equipment-auras', weight: 1, evidence: card.typeLine })
  if (front.includes('Legendary')) add(profile.provides, { id: 'legends', weight: 0.6, evidence: card.typeLine })
  if (front.includes('Planeswalker')) add(profile.provides, { id: 'planeswalkers', weight: 0.6, evidence: card.typeLine })
  if (/\{X\}/.test(card.manaCost ?? '')) add(profile.provides, { id: 'x-spells', weight: 0.6, evidence: card.manaCost! })
}

/** Subtypes the card is, makes as tokens, or rewards: Vampires you control, a Dragon spell. */
function readSubtypes(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const { card } = facts
  for (const face of facts.faces) {
    const creature = face.types.some((t) => t === 'Creature' || t === 'Kindred' || t === 'Tribal')
    for (const sub of face.subtypes) {
      const id = SUBTYPE_FORMS.get(sub)
      if (id && (creature || !CREATURE_TYPE_IDS.has(id))) add(profile.provides, { id, weight: 0.6, evidence: card.typeLine })
    }
  }
  for (const ability of abilities) {
    const evidence = ability.text
    // Tokens of a type, and amassed Armies, make more of it; the first type of an "Elf Warrior" token most.
    const rest = ability.text.replace(SUBTYPE_TOKEN_RE, (phrase) => {
      for (const [i, word] of (phrase.match(SUBTYPE_RE) ?? []).entries()) add(profile.provides, { id: SUBTYPE_FORMS.get(word)!, weight: i === 0 ? 1 : 0.6, evidence })
      return ' '
    })
    for (const match of rest.matchAll(SUBTYPE_RE)) {
      const id = SUBTYPE_FORMS.get(match[0])!
      // "Goblin Formula — …" names an ability; it isn't about Goblins.
      if (ABILITY_NAME_RE.test(rest.slice(match.index + match[0].length))) continue
      const before = (rest.slice(0, match.index).split(/[.;,]/).at(-1) ?? '').replace(TRAILING_SUBTYPES_RE, '')
      if (SUBTYPE_SKIP_RE.test(before)) continue
      if (SUBTYPE_BECOMES_RE.test(before)) {
        add(profile.provides, { id, weight: 1, evidence })
        continue
      }
      add(profile.uses, { id, weight: 1, evidence })
      const parent = SUBTYPE_PARENTS[id]
      if (parent) add(profile.uses, { id: parent, weight: 0.8, evidence })
      if (CREATURE_TYPE_IDS.has(id) && /\bsacrifice (?:a|an|another|two|three|four|five|X|\w+) (?:other |nontoken )?$/i.test(before)) {
        add(profile.provides, { id: 'creature-dies', weight: 1, evidence })
      }
    }
  }
}

/** Roles that follow from mechanics: extra lands are ramp, real card draw is card advantage. */
function readRolesFromMechanics(facts: Facts, abilities: Ability[], profile: CardProfile): void {
  const provided = (id: MechanicId) => profile.provides.find((s) => s.id === id)
  if (facts.land) return
  const extraLand = provided('extra-land-drop')
  if (extraLand) add(profile.roles, { id: 'ramp', weight: extraLand.weight, evidence: extraLand.evidence })
  // Other cards becoming lands makes no mana: they don't gain the ability to tap for it.
  const landsOut = provided('land-enters')
  if (landsOut && !/\bare lands\b/i.test(landsOut.evidence)) add(profile.roles, { id: 'ramp', weight: 1, evidence: landsOut.evidence })
  const treasure = provided('treasure')
  if (treasure) add(profile.roles, { id: 'ramp', weight: 0.6, evidence: treasure.evidence })
  // Card advantage: draws that net at least one card (loot and rummage only filter).
  for (const ability of abilities) {
    const optional = /\byou may draw\b/i.test(ability.effect)
    const net = optional ? 1 : netDraw(facts, ability)
    const repeats = ability.kind !== 'static' || !isSpell(facts)
    if (net >= 1 && (net >= 2 || repeats || isSpell(facts))) {
      add(profile.roles, { id: 'card-advantage', weight: net >= 2 || repeats ? 1 : 0.5, evidence: ability.text })
    }
  }
}

/** Adds what provided mechanics lead to, e.g. discarding also fills the graveyard. */
function addImplied(profile: CardProfile): void {
  for (let changed = true; changed; ) {
    changed = false
    for (const signal of [...profile.provides]) {
      for (const [id, factor] of PROVIDE_IMPLIES[signal.id] ?? []) {
        const weight = signal.weight * factor
        const existing = profile.provides.find((s) => s.id === id)
        if (existing && existing.weight >= weight) continue
        add(profile.provides, { id, weight, evidence: signal.evidence, via: signal.via ?? signal.id, ...(signal.mass && { mass: true as const }) })
        changed = true
      }
    }
  }
}
