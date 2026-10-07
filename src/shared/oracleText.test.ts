import { describe, expect, it } from 'vitest'
import { parseAbilities, withoutOwnName } from './oracleText'
import { testCard, type TestCardName } from './testCards'

const abilities = (name: TestCardName) => parseAbilities(name, testCard(name).text)

describe('parsing rules text into abilities', () => {
  it('splits a triggered ability into its trigger and effect', () => {
    const [extraLand, trigger] = abilities('Flubs, the Fool')
    expect(extraLand).toMatchObject({ kind: 'static', effect: 'You may play an additional land on each of your turns.' })
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: 'you play a land or cast a spell',
      effect: 'draw a card if you have no cards in hand. Otherwise, discard a card.'
    })
  })

  it('keeps an intervening "if" clause with the trigger', () => {
    expect(abilities('Valakut, the Molten Pinnacle')[1]).toMatchObject({
      trigger: 'a Mountain you control enters if you control at least five other Mountains',
      effect: 'you may have this land deal 3 damage to any target.'
    })
  })

  it('reads activation costs, loyalty costs and additional costs', () => {
    expect(abilities('Wooded Foothills')[0]).toMatchObject({ kind: 'activated', cost: '{T}, Pay 1 life, Sacrifice this land' })
    expect(abilities('Wrenn and Six').map((a) => a.cost)).toEqual(['+1', '−1', '−7'])
    expect(abilities('Thrill of Possibility')[0]).toMatchObject({ kind: 'static', cost: 'discard a card', effect: '' })
  })

  it('separates ability words, modal bullets and Saga chapters', () => {
    const [landfall, pump, noBlock] = abilities('Retreat to Valakut')
    expect(landfall).toMatchObject({ word: 'Landfall', trigger: 'a land you control enters' })
    expect([pump.effect, noBlock.effect]).toEqual(['Target creature gets +2/+0 until end of turn.', "Target creature can't block this turn."])
    expect(abilities("Azusa's Many Journeys // Likeness of the Seeker")[0]).toMatchObject({
      word: 'Chapter',
      effect: 'You may play an additional land this turn.'
    })
  })

  it('drops reminder text', () => {
    expect(abilities('Stomping Ground').map((a) => a.text)).toEqual(["As this land enters, you may pay 2 life. If you don't, it enters tapped."])
    expect(abilities('Fiery Temper').map((a) => a.text)).toEqual(['this deals 3 damage to any target.', 'Madness {R}'])
  })

  it('reads the card\'s own name, short name included, as "this"', () => {
    expect(abilities('Titania, Protector of Argoth')[0].trigger).toBe('this enters')
    expect(withoutOwnName('Omnath, Locus of Rage', 'Whenever Omnath or another Elemental dies, Omnath, Locus of Rage deals 3 damage.')).toBe(
      'Whenever this or another Elemental dies, this deals 3 damage.'
    )
  })
})
