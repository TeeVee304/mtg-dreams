import type { Printing } from './types'

/**
 * Set groups a list can prefer Versions from: Universes Beyond franchises (Avatar, Fallout…), found
 * from Scryfall's sets, and Magic's own worlds (Innistrad, Ravnica…), listed here since Scryfall
 * doesn't group sets by world. A group holds its sets with their promos, Commander decks and
 * bonus sheets, but not tokens, art cards or digital sets.
 *
 * @packageDocumentation
 */

/** Sets a list can prefer Versions from. */
export interface SetGroup {
  /** Short name shown and stored with the list, e.g. "Avatar" or "Innistrad" ({@link shortSetName}). */
  name: string
  /** `franchise`: a Universes Beyond set and its spin-offs. `world`: sets of one of Magic's worlds. */
  kind: 'franchise' | 'world'
  /** Lower-case set codes. */
  sets: string[]
  /** Symbol of the group's main set (a franchise's set, a world's first): Scryfall SVG URL. */
  icon?: string
  /** Earlier names a list may have stored, e.g. the set's full name "Avatar: The Last Airbender". */
  aliases?: string[]
}

/** Scryfall set fields the groups are built from. */
export interface SetSummary {
  code: string
  name: string
  set_type: string
  parent_set_code?: string
  digital?: boolean
  released_at?: string
  card_count?: number
  icon_svg_uri?: string
}

/** Set types never in a group: no playable Versions. */
const SKIPPED_TYPES = new Set(['token', 'memorabilia', 'minigame', 'alchemy', 'vanguard'])

/** Universes Beyond started with Warhammer 40,000 (2022); older sets aren't checked. */
export const FRANCHISES_SINCE = '2022-01-01'

/** Set types a Universes Beyond set (the root of its group) can have. */
const FRANCHISE_TYPES = new Set(['expansion', 'core', 'draft_innovation', 'commander', 'masters', 'eternal'])

/** Smallest share of a set's Cards that must be Universes Beyond for the set to be a franchise. */
export const FRANCHISE_SHARE = 0.3

/**
 * Whether each Universes Beyond candidate ({@link franchiseCandidates}) released before this build is
 * a franchise, as checked against Scryfall: only sets released since need checking.
 */
export const KNOWN_FRANCHISES: Record<string, boolean> = Object.fromEntries([
  ...['40k', 'acr', 'fin', 'hob', 'ltr', 'msh', 'pip', 'spm', 'tla', 'tmt', 'trk', 'who'].map((code) => [code, true]),
  ...['2x2', 'blb', 'bro', 'clb', 'cmm', 'dbl', 'dft', 'dmr', 'dmu', 'dsk', 'ecl', 'eoe', 'fdn', 'fra', 'inr', 'j22', 'lci',
    'mat', 'mb2', 'mbc', 'mh3', 'mkm', 'mom', 'neo', 'one', 'otj', 'rvr', 'scd', 'snc', 'sos', 'tdm', 'woe'].map((code) => [code, false])
])

/** Short names where cutting the full name ({@link shortSetName}) reads badly, by set code. */
const SHORT_NAMES: Record<string, string> = {}

/**
 * @returns A franchise set's name, short: without a leading "The", a subtitle after a colon or a
 * trailing "Commander" ("The Hobbit" → "Hobbit"), unless {@link SHORT_NAMES} names it.
 */
export function shortSetName(set: Pick<SetSummary, 'code' | 'name'>): string {
  return SHORT_NAMES[set.code] ?? set.name.split(':')[0].replace(/\s+Commander$/i, '').replace(/^The\s+/i, '').trim()
}

/** @returns Scryfall's set symbol URL, without its version query. */
const iconOf = (set: SetSummary | undefined) => set?.icon_svg_uri?.split('?')[0]

/**
 * Universes Beyond franchises spread over several sets, each one group: its sets (with their own
 * spin-offs) and the set whose symbol it shows. A set joining one needs adding here.
 */
export const UNIVERSES: { name: string; sets: string[]; icon: string }[] = [
  { name: 'Marvel', sets: ['msh', 'spm', 'mar', 'mdd'], icon: 'msh' },
  { name: 'Middle-earth', sets: ['ltr', 'hob'], icon: 'ltr' }
]

/**
 * Magic's worlds, by the sets set there; each set brings its promos, Commander decks and bonus sheets.
 * `icon`: the set whose symbol the world shows, its first set's by default.
 */
export const WORLDS: { name: string; sets: string[]; icon?: string }[] = [
  { name: 'Innistrad', sets: ['isd', 'dka', 'avr', 'soi', 'emn', 'mid', 'vow', 'dbl', 'inr'], icon: 'soi' },
  { name: 'Ravnica', sets: ['rav', 'gpt', 'dis', 'rtr', 'gtc', 'dgm', 'grn', 'rna', 'war', 'mkm', 'rvr'], icon: 'rna' },
  { name: 'Theros', sets: ['ths', 'bng', 'jou', 'thb'] },
  {
    name: 'Dominaria',
    sets: ['dom', 'dmu', 'ice', 'all', 'csp', 'mir', 'vis', 'wth', 'usg', 'ulg', 'uds', 'inv', 'pls', 'apc', 'ody', 'tor', 'jud', 'ons', 'lgn', 'scg', 'tsp', 'plc', 'fut', 'bro']
  },
  { name: 'Zendikar', sets: ['zen', 'wwk', 'roe', 'bfz', 'ogw', 'znr'] },
  { name: 'Kaldheim', sets: ['khm'] },
  { name: 'Kamigawa', sets: ['chk', 'bok', 'sok', 'neo'] },
  { name: 'Ixalan', sets: ['xln', 'rix', 'lci'] },
  { name: 'Eldraine', sets: ['eld', 'woe'] },
  { name: 'Tarkir', sets: ['ktk', 'frf', 'dtk', 'tdm'] },
  { name: 'Amonkhet', sets: ['akh', 'hou'] },
  { name: 'Kaladesh', sets: ['kld', 'aer'] },
  { name: 'Strixhaven', sets: ['stx', 'sos'], icon: 'stx' },
  { name: 'Mirrodin & Phyrexia', sets: ['som', 'mbs', 'nph', 'one', 'mrd', 'dst', '5dn'] },
  { name: 'Alara', sets: ['ala', 'con', 'arb'] },
  { name: 'Lorwyn & Shadowmoor', sets: ['lrw', 'mor', 'shm', 'eve', 'ecl'] },
  { name: 'Bloomburrow', sets: ['blb'] },
  { name: 'Duskmourn', sets: ['dsk'] },
  { name: 'Thunder Junction', sets: ['otj'] },
  { name: 'New Capenna', sets: ['snc'] },
  { name: 'Edge of Eternities', sets: ['eoe'] },
  { name: 'Forgotten Realms', sets: ['afr', 'clb'] },
  { name: 'Ikoria', sets: ['iko'] },
  { name: 'Fiora', sets: ['cns', 'cn2'] },
  { name: 'Rath', sets: ['tmp', 'sth', 'exo', 'nem'] }
]

/** Sets that may be Universes Beyond franchises, to check: recent, paper, top-level sets. */
export function franchiseCandidates(sets: SetSummary[]): SetSummary[] {
  return sets.filter(
    (set) =>
      !set.parent_set_code &&
      !set.digital &&
      set.code !== 'sld' &&
      FRANCHISE_TYPES.has(set.set_type) &&
      (set.released_at ?? '') >= FRANCHISES_SINCE
  )
}

/** @returns Codes of `root` and the sets under it, without {@link SKIPPED_TYPES} and digital sets. */
export function setFamily(root: string, sets: SetSummary[]): string[] {
  const children = new Map<string, SetSummary[]>()
  for (const set of sets) {
    if (!set.parent_set_code) continue
    children.set(set.parent_set_code, [...(children.get(set.parent_set_code) ?? []), set])
  }
  const family: string[] = []
  const visit = (code: string) => {
    family.push(code)
    for (const child of children.get(code) ?? []) {
      if (!child.digital && !SKIPPED_TYPES.has(child.set_type)) visit(child.code)
    }
  }
  visit(root)
  return family
}

/**
 * @param franchises - Codes of the Universes Beyond sets.
 * @returns Franchise groups ({@link shortSetName}; one per {@link UNIVERSES} entry, at its first
 * set's place), known by their earlier names too, then worlds.
 */
export function buildSetGroups(sets: SetSummary[], franchises: string[]): SetGroup[] {
  const known = new Set(sets.map((set) => set.code))
  const byCode = new Map(sets.map((set) => [set.code, set]))
  const groups: SetGroup[] = []
  const merged = new Set<string>()
  for (const code of franchises.filter((code) => known.has(code))) {
    const universe = UNIVERSES.find((universe) => universe.sets.includes(code))
    if (universe) {
      if (merged.has(universe.name)) continue
      merged.add(universe.name)
      const members = universe.sets.filter((member) => known.has(member)).map((member) => byCode.get(member)!)
      const icon = iconOf(byCode.get(universe.icon))
      // Lists may have stored a member's own name, short or full.
      const aliases = [...new Set(members.flatMap((set) => [set.name, set.name.split(':')[0].replace(/\s+Commander$/i, '').trim(), shortSetName(set)]))]
      groups.push({
        name: universe.name,
        kind: 'franchise',
        sets: members.flatMap((set) => setFamily(set.code, sets)),
        ...(icon && { icon }),
        aliases: aliases.filter((alias) => alias !== universe.name)
      })
      continue
    }
    const set = byCode.get(code)!
    const name = shortSetName(set)
    const icon = iconOf(set)
    const shortBefore = set.name.split(':')[0].replace(/\s+Commander$/i, '').trim()
    const aliases = [...new Set([set.name, shortBefore])].filter((alias) => alias !== name)
    groups.push({
      name,
      kind: 'franchise',
      sets: setFamily(code, sets),
      ...(icon && { icon }),
      ...(aliases.length > 0 && { aliases })
    })
  }
  for (const world of WORLDS) {
    const roots = world.sets.filter((code) => known.has(code))
    if (roots.length === 0) continue
    const icon = iconOf(byCode.get(world.icon && known.has(world.icon) ? world.icon : roots[0]))
    groups.push({ name: world.name, kind: 'world', sets: roots.flatMap((code) => setFamily(code, sets)), ...(icon && { icon }) })
  }
  return groups
}

/** @returns The group named `name`, now or before (any case); undefined if none. */
export function findSetGroup(groups: SetGroup[], name: string | null | undefined): SetGroup | undefined {
  if (!name) return undefined
  const key = name.trim().toLowerCase()
  return groups.find((group) => [group.name, ...(group.aliases ?? [])].some((known) => known.toLowerCase() === key))
}

/** @returns Name to sort groups alphabetically by: without a leading "The". */
export const sortName = (group: Pick<SetGroup, 'name'>) => group.name.replace(/^the\s+/i, '')

/**
 * Printings a group offers for a card: auto-eligible ones from its sets whose art first appeared in
 * the group. A reprint reusing older art from another set (as Commander decks and Remastered sets
 * often do) doesn't count; printings of unknown art do.
 * @param printings - All printings of the card.
 */
export function groupPrintings(printings: Printing[], group: Pick<SetGroup, 'sets'>): Printing[] {
  const sets = new Set(group.sets)
  const firstSeen = new Map<string, Printing>()
  for (const printing of printings) {
    if (!printing.illustrationId) continue
    const first = firstSeen.get(printing.illustrationId)
    if (!first || printing.releasedAt < first.releasedAt) firstSeen.set(printing.illustrationId, printing)
  }
  return printings.filter(
    (printing) =>
      printing.autoEligible &&
      sets.has(printing.set) &&
      (!printing.illustrationId || sets.has(firstSeen.get(printing.illustrationId)!.set))
  )
}
