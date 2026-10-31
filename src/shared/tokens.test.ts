import { describe, expect, it } from 'vitest'
import { parseList, serializeList } from './decklist'
import { featuredTokens, partKind, tokenInSets, tokenLabel, tokenVersions, withTokenVersion, type DeckTokenData, type TokenInfo } from './tokens'

const token = (id: string, extra: Partial<TokenInfo> = {}): TokenInfo => ({
  id,
  name: 'Treasure',
  typeLine: 'Token Artifact — Treasure',
  colors: [],
  text: '{T}, Sacrifice this token: Add one mana of any color.',
  imageSmall: null,
  imageNormal: null,
  imageBack: null,
  ...extra
})

const soldier = (id: string, colors = ['W']) =>
  token(id, { name: 'Soldier', typeLine: 'Token Creature — Soldier', power: '1', toughness: '1', colors, text: '' })

describe('partKind', () => {
  it('classifies tokens, emblems and helpers, skipping the card itself', () => {
    expect(partKind('token', 'Token Artifact — Treasure')).toBe('token')
    expect(partKind('combo_piece', 'Emblem — Elspeth')).toBe('emblem')
    expect(partKind('combo_piece', 'Card')).toBe('helper')
    expect(partKind('combo_piece', 'Dungeon')).toBe('helper')
    // Face-down helpers: A Mysterious Creature (Disguise, Cloak), Morph, Manifest.
    expect(partKind('combo_piece', 'Creature')).toBe('helper')
    expect(partKind('combo_piece', 'Creature — Goblin Rogue')).toBeNull()
    expect(partKind('combo_piece', 'Legendary Planeswalker — Elspeth')).toBeNull()
    expect(partKind('meld_part', 'Legendary Creature — Eldrazi')).toBeNull()
  })
})

describe('featuredTokens', () => {
  const data: DeckTokenData = {
    available: true,
    makers: {
      'Smothering Tithe': [{ id: 't1', kind: 'token' }],
      'Dockside Extortionist': [{ id: 't2', kind: 'token' }],
      "Elspeth, Sun's Champion": [
        { id: 's1', kind: 'token' },
        { id: 'e1', kind: 'emblem' }
      ],
      'Boros Recruit Maker': [{ id: 's2', kind: 'token' }],
      'Queen Marchesa': [{ id: 'm1', kind: 'helper' }]
    },
    tokens: {
      t1: token('t1'),
      t2: token('t2'),
      s1: soldier('s1'),
      s2: soldier('s2', ['R', 'W']),
      e1: token('e1', { name: "Elspeth, Sun's Champion Emblem", typeLine: 'Emblem — Elspeth', text: '' }),
      m1: token('m1', { name: 'The Monarch', typeLine: 'Card', text: '' })
    }
  }

  it('merges reprints, keeps distinct tokens apart and orders by kind', () => {
    const tokens = featuredTokens(data, Object.keys(data.makers))
    expect(tokens.map((t) => [tokenLabel(t), t.makers])).toEqual([
      ['1/1 white Soldier', ["Elspeth, Sun's Champion"]],
      ['1/1 red and white Soldier', ['Boros Recruit Maker']],
      ['Treasure', ['Dockside Extortionist', 'Smothering Tithe']],
      ["Elspeth, Sun's Champion emblem", ["Elspeth, Sun's Champion"]],
      ['The Monarch', ['Queen Marchesa']]
    ])
  })

  it('only counts cards of the list', () => {
    expect(featuredTokens(data, ['Smothering Tithe', 'Sol Ring']).map((t) => t.token.name)).toEqual(['Treasure'])
  })
})

describe('token Versions', () => {
  const linked = token('a1', { oracleId: 'o1', set: 'tc21' })
  const shiny = token('b2', { oracleId: 'o1', set: 'tltr' })
  const data: DeckTokenData = { available: true, makers: { 'Smothering Tithe': [{ id: 'a1', kind: 'token' }] }, tokens: { a1: linked, b2: shiny } }

  it('shows the Version a list chose, once loaded, and keeps the one its cards make', () => {
    expect(featuredTokens(data, ['Smothering Tithe'])[0]).toMatchObject({ token: linked, linked })
    expect(featuredTokens(data, ['Smothering Tithe'], new Map([['o1', 'b2']]))[0]).toMatchObject({ token: shiny, linked, chosen: true })
    expect(featuredTokens(data, ['Smothering Tithe'], new Map([['o1', 'zz']]))[0].chosen).toBeUndefined()
  })

  it('stores the choices in one header, and drops it with the last', () => {
    const lines = withTokenVersion(withTokenVersion(parseList('1 Smothering Tithe\n'), 'o1', 'b2'), 'o2', 'c3')
    expect(serializeList(lines)).toBe('// Token Versions: o1=b2 o2=c3\n1 Smothering Tithe\n')
    expect(tokenVersions(lines)).toEqual(new Map([['o1', 'b2'], ['o2', 'c3']]))
    expect(serializeList(withTokenVersion(withTokenVersion(lines, 'o1', null), 'o2', null))).toBe('1 Smothering Tithe\n')
  })

  it('finds a Universe’s Versions in its sets and their token sets', () => {
    expect(tokenInSets(shiny, ['ltr', 'hob'])).toBe(true)
    expect(tokenInSets(linked, ['ltr', 'hob'])).toBe(false)
  })
})
