import { describe, expect, it } from 'vitest'
import { readCard, type CardProfile, type MechanicId, type RoleId } from './mechanics'
import { testCard, type TestCardName } from './testCards'

const read = (name: TestCardName) => readCard(testCard(name))

/** Weights by id of one side of a profile; implied findings are marked `~`. */
function side(profile: CardProfile, key: keyof CardProfile): Record<string, string | number> {
  return Object.fromEntries(profile[key].map((s) => [s.id, 'via' in s && s.via ? `~${s.weight}` : s.weight]))
}

const provides = (name: TestCardName) => side(read(name), 'provides')
const uses = (name: TestCardName) => side(read(name), 'uses')
const stops = (name: TestCardName) => side(read(name), 'stops')
const roles = (name: TestCardName) => Object.keys(side(read(name), 'roles')) as RoleId[]

describe('reading what a card does', () => {
  it('reads Flubs: extra land drops and discarding, wanting land plays, spells and an empty hand', () => {
    expect(provides('Flubs, the Fool')).toMatchObject({
      'extra-land-drop': 1,
      discard: 1,
      'card-draw': 1,
      'land-play': '~1',
      'land-enters': '~1',
      'lands-in-graveyard': '~0.5'
    })
    expect(uses('Flubs, the Fool')).toEqual({ 'land-play': 1, 'spell-cast': 1, 'empty-hand': 1 })
    expect(stops('Flubs, the Fool')).toEqual({})
  })

  it('reads Valakut: counts Mountains entering, is a special land, and deals damage', () => {
    expect(uses('Valakut, the Molten Pinnacle')).toEqual({ 'type-mountain': 1, 'land-enters': 0.5 })
    expect(provides('Valakut, the Molten Pinnacle')).toEqual({ 'nonbasic-utility': 1, drain: 0.6 })
    expect(roles('Valakut, the Molten Pinnacle')).toEqual(expect.arrayContaining(['land', 'burn']))
  })

  it('reads Blood Moon as making Mountains but turning off special lands', () => {
    expect(provides('Blood Moon')).toMatchObject({ 'type-mountain': 0.5 })
    expect(stops('Blood Moon')).toEqual({ 'nonbasic-utility': 1 })
  })

  it('tells basic Mountains and dual lands from lands with special abilities', () => {
    expect(provides('Mountain')).toEqual({ 'type-mountain': 1 })
    expect(provides('Stomping Ground')).toEqual({ 'type-mountain': 1, 'type-forest': 1 })
    expect(provides('Wooded Foothills')).toMatchObject({ 'type-mountain': 1, 'type-forest': 1, 'land-leaves': 1, 'nonbasic-utility': 1 })
  })

  it('reads land recursion as the specific mechanic, not just "uses the graveyard"', () => {
    expect(provides('Crucible of Worlds')).toMatchObject({ 'land-play': 1 })
    expect(uses('Crucible of Worlds')).toEqual({ 'lands-in-graveyard': 1 })
    expect(uses('Wrenn and Six')).toMatchObject({ 'lands-in-graveyard': 1 })
  })

  it('tells discard outlets that empty your hand from ones that refill it', () => {
    expect(provides('Seismic Assault')).toMatchObject({ discard: 1, 'lands-in-graveyard': 1, 'empty-hand': 1 })
    expect(roles('Seismic Assault')).toContain('burn')
    expect(provides('Glint-Horn Buccaneer')).not.toHaveProperty('empty-hand')
    expect(uses('Glint-Horn Buccaneer')).toMatchObject({ discard: 1 })
    expect(provides('Greenseeker')).not.toHaveProperty('empty-hand')
  })

  it('counts only discarding by you, and madness as a discard payoff', () => {
    expect(uses('Waste Not')).not.toHaveProperty('discard')
    expect(uses('Fiery Temper')).toEqual({ discard: 0.8 })
  })

  it('flags forced card draw that fills your hand, but not loot, rummage or optional draws', () => {
    expect(stops('Harmonize')).toEqual({ 'empty-hand': 1 })
    expect(stops('Tatyova, Benthic Druid')).toEqual({ 'empty-hand': 0.3 })
    for (const name of ['Faithless Looting', 'Thrill of Possibility', 'Aesi, Tyrant of Gyre Strait', 'Rhystic Study', "Nylea's Presence"] as const) {
      expect(stops(name), name).toEqual({})
    }
    expect(roles('Harmonize')).toContain('card-advantage')
    expect(roles('Rhystic Study')).toContain('card-advantage')
    expect(roles('Faithless Looting')).not.toContain('card-advantage')
  })

  it('marks effects on all your lands at once', () => {
    const omen = read('Prismatic Omen').provides
    expect(omen.filter((s) => s.mass).map((s) => s.id)).toEqual(
      expect.arrayContaining<MechanicId>(['type-plains', 'type-island', 'type-swamp', 'type-mountain', 'type-forest'])
    )
    expect(read('Scapeshift').provides.find((s) => s.id === 'type-mountain')).toMatchObject({ weight: 0.8, mass: true })
    expect(read('Splendid Reclamation').provides.find((s) => s.id === 'land-enters')).toMatchObject({ mass: true })
    expect(read("Nylea's Presence").provides.some((s) => s.mass)).toBe(false)
  })

  it('reads ramp that puts lands onto the battlefield, and ignores lands given to an opponent', () => {
    expect(provides('Cultivate')).toMatchObject({ 'land-enters': 1, 'land-play': 0.6, 'type-mountain': 0.8 })
    expect(roles('Cultivate')).toContain('ramp')
    expect(provides('Path to Exile')).not.toHaveProperty('land-enters')
    expect(roles('Path to Exile')).toContain('removal')
  })

  it('reads landfall, land sacrifice payoffs and one-turn extra land drops', () => {
    expect(uses('Lotus Cobra')).toEqual({ 'land-enters': 1 })
    expect(uses('Titania, Protector of Argoth')).toMatchObject({ 'land-leaves': 1, 'lands-in-graveyard': 1 })
    expect(provides('Titania, Protector of Argoth')).toMatchObject({ 'land-enters': 1, 'creature-tokens': 1 })
    expect(provides("Azusa's Many Journeys // Likeness of the Seeker")).toMatchObject({ 'extra-land-drop': 0.5 })
  })

  it('reads landcycling as finding that land type', () => {
    expect(provides('Valley Rannet')).toMatchObject({ 'type-mountain': 0.5, 'type-forest': 0.5, 'land-play': 0.5 })
  })

  it('tells graveyard hate that hits your graveyard apart from hate that only stops casting', () => {
    expect(stops('Rest in Peace')).toEqual({ graveyard: 1, 'lands-in-graveyard': 1 })
    expect(stops("Grafdigger's Cage")).toEqual({ graveyard: 0.5 })
  })

  it('weighs direct damage by how often it happens and whom it hits', () => {
    const burn = (name: TestCardName) => read(name).roles.find((r) => r.id === 'burn')?.weight
    // Every opponent, or any target again and again: no tap symbol, so no once-a-turn limit.
    expect(burn('Glint-Horn Buccaneer')).toBe(1)
    expect(burn('Seismic Assault')).toBe(1)
    expect(burn('Valakut, the Molten Pinnacle')).toBe(1)
    // A loyalty ability works once a turn; a spell once.
    expect(burn('Wrenn and Six')).toBe(0.8)
    expect(burn('Fiery Temper')).toBe(0.3)
  })

  it('counts damage as it enters once, even with a condition', () => {
    expect(read('Vibrance').roles.find((r) => r.id === 'burn')?.weight).toBe(0.3)
  })

  it('weighs card search for any card above search for one kind', () => {
    const tutor = (name: TestCardName) => read(name).roles.find((r) => r.id === 'tutor')?.weight
    expect(tutor('Gamble')).toBe(1)
    expect(tutor('Worldly Tutor')).toBe(0.6)
    expect(tutor('Cultivate')).toBeUndefined()
  })

  it('weighs protection for everything above gear for one creature, read from Equipment too', () => {
    const protection = (name: TestCardName) => read(name).roles.find((r) => r.id === 'protection')?.weight
    expect(protection('Heroic Intervention')).toBe(1)
    expect(protection('Swiftfoot Boots')).toBe(0.8)
  })

  it('flags wipes that take your lands too', () => {
    expect(stops('Apocalypse')).toMatchObject({ 'type-mountain': 1, 'land-count': 1 })
    expect(stops('Splendid Reclamation')).toEqual({})
  })

  it('ignores triggers that only hurt you', () => {
    expect(uses('Pangosaur')).toEqual({})
  })

  it('reads mana from landfall as ramp', () => {
    expect(roles('Lotus Cobra')).toContain('ramp')
  })

  it('reads earthbend from what its reminder text says: a land becomes a creature with counters', () => {
    expect(provides('Avatar Kyoshi, Earthbender')).toMatchObject({ 'land-creatures': 1, counters: 1, bending: 1 })
    expect(roles('Avatar Kyoshi, Earthbender')).not.toContain('ramp')
    expect(uses('Toph, Greatest Earthbender')).toEqual({ 'land-creatures': 1 })
  })

  it('reads poison: giving it, adding to it with proliferate, and the deathtouch Fynn wants', () => {
    expect(provides('Fynn, the Fangbearer')).toMatchObject({ poison: 1, deathtouch: 0.6, 'tribe-warrior': 0.6 })
    expect(uses('Fynn, the Fangbearer')).toMatchObject({ deathtouch: 1 })
    expect(provides('Blighted Agent')).toMatchObject({ poison: 1 })
    expect(provides("Atraxa, Praetors' Voice")).toMatchObject({ proliferate: 1, deathtouch: 0.6 })
    expect(provides("Atraxa, Praetors' Voice")).not.toHaveProperty('counters')
    expect(uses("Atraxa, Praetors' Voice")).toMatchObject({ poison: 0.8, counters: 1 })
  })

  it('reads creature types: being one, making them, and rewarding them', () => {
    expect(provides('Edgar Markov')).toMatchObject({ 'tribe-vampire': 1, 'tribe-knight': 0.6, legends: 0.6 })
    expect(uses('Edgar Markov')).toMatchObject({ 'tribe-vampire': 1 })
    expect(provides('Krenko, Mob Boss')).toMatchObject({ 'tribe-goblin': 1, 'creature-tokens': 1 })
    expect(uses('Krenko, Mob Boss')).toMatchObject({ 'tribe-goblin': 1 })
    expect(provides('Giada, Font of Hope')).toMatchObject({ counters: 1, 'tribe-angel': 0.6 })
    expect(uses('Giada, Font of Hope')).toMatchObject({ 'tribe-angel': 1 })
  })

  it('reads tokens however they are worded, and sacrificing creatures of a type', () => {
    expect(provides('Chatterfang, Squirrel General')).toMatchObject({ 'creature-tokens': 1, 'tribe-squirrel': 1, 'creature-dies': 1 })
    expect(uses('Chatterfang, Squirrel General')).toMatchObject({ 'tribe-squirrel': 1 })
  })

  it('reads sacrificing and dying payoffs that aren’t costs or “dies” triggers', () => {
    expect(provides('Korvold, Fae-Cursed King')).toMatchObject({ 'creature-dies': 1 })
    expect(uses('Korvold, Fae-Cursed King')).toMatchObject({ 'creature-dies': 1 })
    expect(uses('Teysa Karlov')).toMatchObject({ 'creature-dies': 1, 'creature-tokens': 1 })
  })

  it('reads changelings and cards for a creature type you choose', () => {
    expect(provides('Changeling Outcast')).toMatchObject({ 'tribe-any': 0.6, 'tribe-shapeshifter': 0.6 })
    expect(uses("Herald's Horn")).toMatchObject({ 'tribe-any': 1 })
  })

  it('reads land creatures only within one clause, and not from removal aimed at them', () => {
    expect(provides('Akoum Hellkite')).not.toHaveProperty('land-creatures')
    expect(uses('Akoum Hellkite')).toHaveProperty('land-enters')
    expect(uses('Consuming Sinkhole')).not.toHaveProperty('land-creatures')
  })

  it('reads artifacts becoming lands: more lands entering, but no mana', () => {
    expect(provides('Toph, the First Metalbender')).toMatchObject({ 'land-creatures': 1, 'land-enters': 0.8, 'land-count': 0.8 })
    expect(uses('Toph, the First Metalbender')).toEqual({ artifacts: 1 })
    expect(roles('Toph, the First Metalbender')).not.toContain('ramp')
  })

  it('keeps the rules text each finding came from', () => {
    const discard = read('Flubs, the Fool').provides.find((s) => s.id === 'discard')
    expect(discard?.evidence).toBe('Whenever you play a land or cast a spell, draw a card if you have no cards in hand. Otherwise, discard a card.')
  })
})
