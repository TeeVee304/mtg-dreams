import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { SUBTYPES } from '@shared/deckWizard/creatureTypes'
import type { DeckFocusInfo } from '@shared/deckWizard/api'
import { setEnvironment, SERVICES } from '../environment'
import { setWizardServices } from './services'

/**
 * Benchmark of the card reader against EDHREC: for popular commanders, how many of their top
 * themes on EDHREC the wizard offers as a win condition or theme of its own. EDHREC is only a
 * yardstick here; nothing from it ships with the app. Opt-in: set `MTG_DREAMS_LIBRARY_DIR` to a
 * folder with the card library and an `edhrec-themes.json` snapshot, a list of
 * `{ name, tags: [{ theme }] }` with each commander's themes, most played first. Writes
 * `edhrec-benchmark.md` there with what was missed.
 *
 * @packageDocumentation
 */

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR
const SNAPSHOT = DIR && join(DIR, 'edhrec-themes.json')
/** Share of comparable themes the wizard must offer: the last recorded result, 2026-10-08. */
const BASELINE = 0.75
/** Themes compared per commander: its most played. */
const TOP = 3

/** EDHREC themes that are play styles, which the wizard asks about directly instead. */
const STYLES = new Set(['Weenies', 'Midrange', 'Control', 'Pillow Fort', 'Stax', 'Group Hug', 'Politics', 'Tempo', 'Good Stuff', 'Chaos', 'Aikido', 'Land Destruction', 'Theft'])
const LANDS = ['land-enters', 'land-play', 'land-count', 'extra-land-drop', 'land-leaves', 'lands-in-graveyard', 'land-creatures']
const BURN = ['w:group-slug', 'e:drain']

/** EDHREC theme → the wizard's win conditions (w:), themes (e:) and jobs (j:) that cover it. */
const COVERS: Record<string, string[]> = {
  Tokens: ['e:creature-tokens', 'w:go-wide'], Populate: ['e:creature-tokens'], Amass: ['e:creature-tokens', 'e:counters'],
  Aggro: ['w:beatdown', 'w:go-wide', 'e:attacking'], 'Extra Combats': ['e:attacking'], 'Attack Triggers': ['e:attacking'], 'Forced Combat': ['e:attacking'],
  '+1/+1 Counters': ['e:counters'], 'Counters Matter': ['e:counters', 'e:proliferate'], 'Modified Creatures': ['e:counters', 'e:equipment-auras'],
  Cheerios: ['e:equipment-auras'], Equipment: ['e:equipment-auras', 'w:voltron'], Voltron: ['w:voltron'], Auras: ['e:equipment-auras', 'e:enchantments'],
  Reanimator: ['e:graveyard'], Graveyard: ['e:graveyard'], 'Self-Mill': ['e:graveyard'], Dredge: ['e:graveyard'],
  Burn: BURN, Lifedrain: BURN, 'Group Slug': BURN, Pingers: BURN, 'Self-Damage': BURN,
  Lifegain: ['e:lifegain'], Artifacts: ['e:artifacts'], Thopters: ['e:artifacts'], Affinity: ['e:artifacts'], Food: ['e:artifacts'],
  Vehicles: ['e:tribe-vehicle', 'e:artifacts'], Treasure: ['e:treasure', 'e:artifacts'],
  Aristocrats: ['e:creature-dies'], Sacrifice: ['e:creature-dies'], Eggs: ['e:tribe-egg', 'e:creature-dies'],
  'Lands Matter': LANDS.map((id) => `e:${id}`), Landfall: ['e:land-enters'],
  Storm: ['e:spell-cast'], Spellslinger: ['e:spell-cast'], Cantrips: ['e:spell-cast'], 'Spell Copy': ['e:spell-cast'], 'X Spells': ['e:x-spells'],
  'Card Draw': ['e:card-draw'], Wheels: ['e:card-draw', 'e:discard'], Discard: ['e:discard'],
  Enchantress: ['e:enchantments'], Sagas: ['e:tribe-saga', 'e:enchantments'], Shrines: ['e:tribe-shrine'], Towns: ['e:tribe-town'],
  Mill: ['w:mill'], Blink: ['e:creature-enters'], ETB: ['e:creature-enters'],
  Proliferate: ['e:proliferate'], Infect: ['e:poison', 'w:infect'], Combo: ['w:combo'], '-1/-1 Counters': ['e:minus-counters'],
  Ramp: ['j:ramp', 'e:extra-land-drop'], 'Big Mana': ['j:ramp', 'e:extra-land-drop'],
  Legends: ['e:legends'], Historic: ['e:legends'], Flying: ['e:flying'], Cascade: ['e:cascade'], Discover: ['e:cascade'],
  Planeswalkers: ['e:planeswalkers'], Clones: ['e:copies'], Offspring: ['e:copies', 'e:creature-tokens'], 'Toughness Matters': ['e:toughness'], Defenders: ['e:toughness'],
  Monarch: ['e:monarch'], 'Extra Upkeeps': ['e:upkeep'], Explore: ['e:counters'],
  Airbending: ['e:bending'], Waterbending: ['e:bending'], Firebending: ['e:bending'], Earthbending: ['e:bending', 'e:land-creatures'],
  Ninjutsu: ['e:tribe-ninja', 'e:attacking'], Devoid: ['e:tribe-eldrazi'], Evoke: ['e:tribe-elemental', 'e:creature-dies']
}
// Creature-type themes, Elves or Dragons, are covered by their type.
for (const [id, , plural] of SUBTYPES) COVERS[plural] ??= [`e:${id}`]

/** A commander's top themes on EDHREC. */
interface Snapshot {
  name: string
  tags: Array<{ theme: string }>
}

describe.skipIf(!SNAPSHOT || !existsSync(SNAPSHOT))('the card reader against EDHREC themes', { timeout: 600_000 }, () => {
  const misses = new Map<string, string[]>()
  let compared = 0
  let covered = 0

  beforeAll(async () => {
    setEnvironment({ ...SERVICES, userData: DIR!, documents: DIR!, appData: DIR!, trash: async () => undefined, userAgent: 'MTGDreams/benchmark' })
    setWizardServices({ spellbookApi: 'http://127.0.0.1:9' })
    const { deckFocusInfo } = await import('./focus')
    const snapshot = JSON.parse(readFileSync(SNAPSHOT!, 'utf8')) as Snapshot[]
    for (const commander of snapshot) {
      let focus: DeckFocusInfo
      try {
        focus = await deckFocusInfo(commander.name, [], 'trend')
      } catch {
        continue
      }
      const offered = new Set([
        ...focus.wincons.filter((w) => w.why).map((w) => `w:${w.id}`),
        ...focus.engines.map((e) => `e:${e.id}`),
        ...focus.commander.jobs.map((j) => `j:${j.label.toLowerCase()}`)
      ])
      for (const { theme } of commander.tags.slice(0, TOP)) {
        const covers = COVERS[theme]
        if (STYLES.has(theme) || !covers) continue
        compared++
        if (covers.some((key) => offered.has(key))) covered++
        else misses.set(theme, [...(misses.get(theme) ?? []), commander.name])
      }
    }
    const lines = [`# Card reader against EDHREC: ${covered} of ${compared} themes (${Math.round((100 * covered) / compared)}%)`, '']
    for (const [theme, names] of [...misses].sort((a, b) => b[1].length - a[1].length)) lines.push(`- **${theme}** (${names.length}): ${names.join('; ')}`)
    await writeFile(join(DIR!, 'edhrec-benchmark.md'), `${lines.join('\n')}\n`)
  }, 600_000)

  it(`offers at least ${BASELINE * 100}% of popular commanders' top themes`, () => {
    expect(compared).toBeGreaterThan(100)
    expect(covered / compared).toBeGreaterThanOrEqual(BASELINE)
  })
})
