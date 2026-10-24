import { describe, expect, it } from 'vitest'
import { headerLeaders } from './listFigures'
import type { Row } from './summary'

/** A commander row: its type line, colors and art, once loaded. */
const leader = (name: string, typeLine: string, colorIdentity: string[], loaded = true) =>
  ({
    line: { name },
    info: { typeLine, colorIdentity },
    resolution: loaded ? { printing: { imageNormal: `https://cards.scryfall.io/normal/${name}.jpg` } } : null
  }) as unknown as Row

const art = (name: string) => `https://cards.scryfall.io/art_crop/${name}.jpg`

describe("a list header's commanders", () => {
  it('pictures one commander, or both partners', () => {
    const okaun = leader('Okaun', 'Legendary Creature — Cyclops Berserker', ['R'])
    const zndrsplt = leader('Zndrsplt', 'Legendary Creature — Homunculus', ['U'])
    expect(headerLeaders([okaun], true)).toMatchObject({ names: ['Okaun'], arts: [art('Okaun')], background: null })
    expect(headerLeaders([okaun, zndrsplt], true)).toMatchObject({ names: ['Okaun', 'Zndrsplt'], arts: [art('Okaun'), art('Zndrsplt')] })
  })

  it('puts the commander first, and its Background apart as a badge', () => {
    const giants = leader('Raised by Giants', 'Legendary Enchantment — Background', ['G'])
    const wilson = leader('Wilson', 'Legendary Creature — Bear Warrior', ['G'])
    expect(headerLeaders([giants, wilson], true)).toMatchObject({
      names: ['Wilson', 'Raised by Giants'],
      arts: [art('Wilson')],
      background: { name: 'Raised by Giants', art: art('Raised by Giants'), color: 'G' }
    })
  })

  it('shows no half pair, and no art without card images', () => {
    const okaun = leader('Okaun', 'Legendary Creature — Cyclops Berserker', ['R'])
    const loading = leader('Zndrsplt', 'Legendary Creature — Homunculus', ['U'], false)
    expect(headerLeaders([okaun, loading], true).arts).toEqual([])
    const giants = leader('Raised by Giants', 'Legendary Enchantment — Background', [])
    const wilson = leader('Wilson', 'Legendary Creature — Bear Warrior', ['G'])
    expect(headerLeaders([wilson, giants], false)).toMatchObject({ arts: [], background: { art: null, color: 'C' } })
  })
})
