import { describe, expect, it } from 'vitest'
import { featuredTokens, partKind, tokenLabel, type DeckTokenData, type TokenInfo } from './tokens'

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
