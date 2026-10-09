import { describe, expect, it } from 'vitest'
import { engineChoice, engineOptions, interactionOf, newBrief, normalizeBrief, paceOf, winconChoice, winconOptions } from './deckBrief'
import { readCard } from './mechanics'
import type { FocusCard } from './synergy'
import { testCard, type TestCardName } from './testCards'

const focusOn = (...names: TestCardName[]): FocusCard[] => names.map((name) => ({ name, profile: readCard(testCard(name)) }))

describe('win conditions', () => {
  const wincons = winconOptions(focusOn('Flubs, the Fool', 'Valakut, the Molten Pinnacle'))
  const wincon = (id: string) => wincons.find((r) => r.id === id)

  it('offers every win condition, those the commander and key cards point to first, saying why', () => {
    expect(wincons.map((r) => r.id).sort()).toEqual(['beatdown', 'combo', 'go-wide', 'group-slug', 'infect', 'mill', 'voltron'])
    expect(wincon('group-slug')?.why).toBe('Valakut, the Molten Pinnacle deals damage on its own.')
    const firstWithout = wincons.findIndex((r) => !r.why)
    expect(wincons.slice(firstWithout).every((r) => !r.why)).toBe(true)
  })

  it('points earthbenders at attacking with their lands and growing one big threat', () => {
    const toph = winconOptions(focusOn('Toph, the First Metalbender', 'Avatar Kyoshi, Earthbender'))
    expect(toph.find((r) => r.id === 'beatdown')?.why).toBe('Toph, the First Metalbender turns your lands into creatures, ready to attack.')
    expect(toph.find((r) => r.id === 'voltron')?.why).toBe('Toph, the First Metalbender puts +1/+1 counters on creatures, growing one big threat.')
  })

  it('points Atraxa and Fynn at Infect, and offers proliferate and deathtouch as themes', () => {
    const focus = focusOn("Atraxa, Praetors' Voice", 'Fynn, the Fangbearer')
    expect(winconOptions(focus).find((r) => r.id === 'infect')?.why).toBe('Fynn, the Fangbearer gives opponents poison counters.')
    expect(engineOptions(focus).map((e) => e.id)).toEqual(expect.arrayContaining(['poison', 'proliferate', 'deathtouch']))
  })

  it('names win conditions as players do, with plain words alongside', () => {
    expect(winconChoice('voltron')).toMatchObject({ label: 'Voltron', plain: 'One huge threat' })
    expect(winconChoice('group-slug').label).toBe('Group Slug')
  })
})

describe('themes', () => {
  it('offers what the commander and key cards do strongly, by their community name, saying who does it', () => {
    const engines = engineOptions(focusOn('Flubs, the Fool', 'Valakut, the Molten Pinnacle'))
    expect(engines.find((e) => e.id === 'land-enters')).toMatchObject({ label: 'Landfall', plain: 'Lands entering' })
    expect(engines.find((e) => e.id === 'land-enters')?.why).toBe(
      'Flubs, the Fool lets you play extra lands each turn, which puts extra lands onto the battlefield.'
    )
    expect(engines.find((e) => e.id === 'land-play')?.why).toBe('Flubs, the Fool triggers when you play a land.')
    expect(engines.find((e) => e.id === 'type-mountain')?.why).toBe('Valakut, the Molten Pinnacle counts your Mountains.')
  })

  it('offers animated lands for the earthbenders, and creature types as tribal themes', () => {
    const engines = engineOptions(focusOn('Toph, the First Metalbender', 'Avatar Kyoshi, Earthbender'))
    expect(engines.find((e) => e.id === 'land-creatures')).toMatchObject({
      label: 'Animated Lands',
      why: 'Toph, the First Metalbender turns your lands into creatures.'
    })
    expect(engines.map((e) => e.id)).not.toContain('nonbasic-utility')
    expect(engineChoice('tribe-vampire')).toMatchObject({ label: 'Vampire Tribal', plain: 'Vampires' })
  })
})

describe('strategy', () => {
  it('sets the pace and, unless the player chose, the interaction', () => {
    expect(paceOf({ strategy: 'aggro' })).toBe('fast')
    expect(paceOf({ strategy: 'big-mana' })).toBe('big')
    expect(paceOf({ strategy: null })).toBe('steady')
    expect(interactionOf({ strategy: 'control', interaction: 'auto' })).toBe('heavy')
    expect(interactionOf({ strategy: 'control', interaction: 'light' })).toBe('light')
    expect(interactionOf({ strategy: null, interaction: 'auto' })).toBe('some')
  })
})

describe('checking a brief', () => {
  it('starts at Bracket 2, with the strategy and interaction left to the wizard', () => {
    expect(newBrief('Flubs, the Fool')).toMatchObject({ bracket: 2, strategy: null, interaction: 'auto', wincons: [], locks: [] })
  })

  it('keeps valid answers', () => {
    const brief = {
      ...newBrief('Flubs, the Fool'),
      anchors: ['Valakut, the Molten Pinnacle'],
      bracket: 3 as const,
      strategy: 'big-mana' as const,
      wincons: ['group-slug' as const],
      engines: ['land-enters' as const],
      interaction: 'heavy' as const,
      ideaId: 'big-mana|group-slug|land-enters',
      locks: ['Scapeshift']
    }
    expect(normalizeBrief(brief)).toEqual(brief)
  })

  it('needs a commander', () => {
    expect(normalizeBrief({})).toBeNull()
    expect(normalizeBrief({ commander: '  ' })).toBeNull()
  })

  it('falls back to defaults for invalid answers and trims lists to their limits', () => {
    const brief = normalizeBrief({
      commander: ' Flubs, the Fool ',
      anchors: ['A', 'b', 'B', 'C', 'D', 'flubs, the fool'],
      bracket: 9,
      strategy: 'tempo',
      wincons: ['group-slug', 'group-slug', 'teleport', 'mill', 'infect'],
      engines: ['nonbasic-utility', 'land-enters', 'land-enters', 'discard', 'counters'],
      interaction: 'always',
      pets: ['A', 'Pet', 42],
      avoid: ['Pet', 'Blood Moon'],
      avoidRoles: ['counterspell', 'land', 'nonsense'],
      locks: ['Blood Moon', 'Sol Ring'],
      budget: { total: -5, perCard: 20, basis: 'cheapest' },
      wildcards: 99
    })
    expect(brief).toMatchObject({
      commander: 'Flubs, the Fool',
      anchors: ['A', 'b', 'C'],
      bracket: 2,
      strategy: null,
      wincons: ['group-slug', 'mill'],
      engines: ['land-enters', 'discard'],
      interaction: 'auto',
      pets: ['Pet'],
      avoid: ['Blood Moon'],
      avoidRoles: ['counterspell'],
      locks: ['Sol Ring'],
      budget: { total: null, perCard: 20, basis: 'trend' },
      wildcards: 10
    })
  })

  it('keeps the answers of briefs saved by earlier versions', () => {
    const brief = normalizeBrief({ commander: 'Flubs, the Fool', routes: ['burn', 'value', 'combat'], pace: 'fast', interaction: 'some' })
    expect(brief).toMatchObject({ wincons: ['group-slug', 'beatdown'], strategy: 'aggro', interaction: 'some' })
  })
})
