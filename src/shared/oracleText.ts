/**
 * Splits Oracle rules text into abilities, so detectors can tell *when* something happens (the
 * trigger), what it costs, and what it does: "Whenever you discard a card" uses discarding, while
 * "Discard a card:" and "then discard a card" provide it.
 *
 * @packageDocumentation
 */

/** How an ability works: triggered (When/Whenever/At), activated (cost: effect), or static (spells too). */
export type AbilityKind = 'triggered' | 'activated' | 'static'

/** One ability of a card. */
export interface Ability {
  kind: AbilityKind
  /** Ability word, e.g. `Landfall`; Saga chapters are `Chapter`. */
  word?: string
  /** Trigger condition, intervening "if" clause included: `a land you control enters`. */
  trigger?: string
  /** Activation cost, or an additional cost to cast the spell. */
  cost?: string
  /** What the ability does; the whole text for static abilities and spells. */
  effect: string
  /** The ability as printed, reminder text removed, for quoting as evidence. */
  text: string
}

/** Reminder text in parentheses. */
const REMINDER_RE = /\s*\([^()]*\)/g
/** Ability word prefix: `Landfall — `. */
const ABILITY_WORD_RE = /^([A-Z][a-z]+(?:[ -][a-z]+)*) — (?=\S)/
/** Saga chapter prefix: `I — `, `II, III — `. */
const CHAPTER_RE = /^[IVX]+(?:, [IVX]+)* — /
/** Triggered ability: condition up to the first comma, then the effect. */
const TRIGGER_RE = /^(?:When|Whenever|At) ([^,]+), (.*)$/
/** Intervening "if" clause at the start of a triggered effect. */
const INTERVENING_IF_RE = /^(if [^,]+), (.*)$/
/** Activated ability: a cost without periods or quotes, a colon, then the effect. */
const ACTIVATED_RE = /^([^:."]+): (.+)$/
/** Costs start with a mana or tap symbol, a loyalty change, or a cost verb. */
const COST_START_RE = /^(?:\{|[+−-]?(?:\d+|X)$|(?:Sacrifice|Discard|Pay|Exile|Tap|Untap|Remove|Return|Mill|Reveal|Put|Collect|Forage)\b)/
/** Additional cost of a spell. */
const ADDITIONAL_COST_RE = /^As an additional cost to cast this spell, (.+?)\.?$/

/** Escapes a string for use in a regular expression. */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces a card's own name with `this`, so its text reads like newer templating ("When Titania
 * enters" → "When this enters"). Legendary short names (before the comma) count too.
 */
export function withoutOwnName(name: string, text: string): string {
  const names = new Set<string>()
  for (const face of name.split(' // ')) {
    names.add(face)
    const short = face.split(', ')[0]
    if (short !== face && short.length >= 3) names.add(short)
  }
  // Longest first, so "Omnath, Locus of Rage" goes before "Omnath".
  const pattern = [...names].sort((a, b) => b.length - a.length).map(escape).join('|')
  return text.replace(new RegExp(`\\b(?:${pattern})\\b`, 'g'), 'this')
}

/** Parses one line of rules text. */
function parseLine(line: string): Ability {
  let rest = line
  let word: string | undefined
  const chapter = CHAPTER_RE.exec(rest)
  if (chapter) {
    return { kind: 'triggered', word: 'Chapter', trigger: 'chapter', effect: rest.slice(chapter[0].length), text: line }
  }
  const abilityWord = ABILITY_WORD_RE.exec(rest)
  if (abilityWord) {
    word = abilityWord[1]
    rest = rest.slice(abilityWord[0].length)
  }
  const triggered = TRIGGER_RE.exec(rest)
  if (triggered) {
    let trigger = triggered[1]
    let effect = triggered[2]
    const intervening = INTERVENING_IF_RE.exec(effect)
    if (intervening) {
      trigger += ` ${intervening[1]}`
      effect = intervening[2]
    }
    return { kind: 'triggered', ...(word && { word }), trigger, effect, text: line }
  }
  const additional = ADDITIONAL_COST_RE.exec(rest)
  if (additional) return { kind: 'static', cost: additional[1], effect: '', text: line }
  const activated = ACTIVATED_RE.exec(rest)
  if (activated && COST_START_RE.test(activated[1])) {
    return { kind: 'activated', ...(word && { word }), cost: activated[1], effect: activated[2], text: line }
  }
  return { kind: 'static', ...(word && { word }), effect: rest, text: line }
}

/**
 * @param name - Card name; its mentions in the text become `this`.
 * @param text - Oracle text, faces joined by newlines.
 * @returns Abilities in printed order; modal bullets (`• …`) are abilities of their own.
 */
export function parseAbilities(name: string, text: string): Ability[] {
  return withoutOwnName(name, text)
    .replace(REMINDER_RE, '')
    .split('\n')
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter((line) => line && line !== '//')
    .map(parseLine)
}
