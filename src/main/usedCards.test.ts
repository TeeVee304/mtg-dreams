import { describe, expect, it } from 'vitest'
import type { LoadedData } from '@shared/api'
import { buildSnapshot, serializeSnapshot } from '@shared/trade'
import { usedCardKeys } from './usedCards'

describe('Cards the data folder uses', () => {
  it('are those its lists, inventory and trade lists name', () => {
    const trade = serializeSnapshot(buildSnapshot('Dani', { haves: [{ name: 'Mana Crypt', qty: 1 }], wants: [{ name: 'Rhystic Study', qty: 1, lists: [] }] }))
    const data: LoadedData = {
      dataDir: 'C:/Data',
      decks: [{ name: 'Burn', text: '// Color: Red\n4 Lightning Bolt <141> [A25]\n' }],
      wishlists: [{ name: 'Wants', text: '1 Relámpago {ES}\n' }],
      brews: [{ name: 'Ideas', text: 'Sideboard\n1 Counterspell\n' }],
      inventory: '2 Sol Ring\n',
      trades: [{ name: 'Dani', text: trade }, { name: 'Broken', text: '{ not json' }],
      wishlistOrder: [],
      unreadable: [],
      readOnly: false
    }
    expect([...usedCardKeys(data)].sort()).toEqual(['counterspell', 'lightning bolt', 'mana crypt', 'relámpago', 'rhystic study', 'sol ring'])
  })
})
