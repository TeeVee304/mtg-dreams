import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseList } from '@shared/decklist'
import type { WantedCard } from '@shared/wanted'
import type { WantedOverview } from '../lib/wanted'
import { BasicsTab } from './wanted/BasicsTab'
import { ListChips, listMetas } from './wanted/parts'
import { Welcome } from './Welcome'

/**
 * Components rendered to HTML in Node, without a browser: what each shows for the state it's
 * given. Interaction is covered by the end-to-end tests.
 *
 * @packageDocumentation
 */

const noop = () => undefined
/** Visible text of rendered HTML. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('the welcome page', () => {
  it('starts a new player with their collection', () => {
    const text = textOf(renderToStaticMarkup(<Welcome owned={0} onPaste={noop} onAddPrecon={noop} onNew={noop} onWizard={noop} />))
    expect(text).toContain('Paste your collection')
    expect(text).toContain('Let the Deck Wizard plan a Commander deck')
  })

  it('offers a deck from the cards a player owns', () => {
    const text = textOf(renderToStaticMarkup(<Welcome owned={240} onPaste={noop} onAddPrecon={noop} onNew={noop} onWizard={noop} />))
    expect(text).toContain('Build a deck from the 240 cards you own')
    expect(text).not.toContain('Paste your collection')
  })
})

describe('Most Wanted', () => {
  const lists = [
    { kind: 'wishlist' as const, name: 'Elves', text: '', lines: parseList('// Priority: High\n2 Llanowar Elves') },
    { kind: 'deck' as const, name: 'Burn', text: '', lines: parseList('4 Lightning Bolt') }
  ]

  it('shows the lists that want a card, high priority starred and decks marked', () => {
    const html = renderToStaticMarkup(
      <ListChips lists={[{ kind: 'wishlist', name: 'Elves', wants: 2, missing: 2 }, { kind: 'deck', name: 'Burn' }]} meta={listMetas(lists)} onOpenList={noop} />
    )
    expect(textOf(html)).toBe('★ Elves · 2 Burn')
    expect(html).toContain('title="Elves wants 2 · high priority"')
    expect(html).toContain('title="Deck Burn"')
  })

  it('says when no basic lands are needed', () => {
    const overview = { cards: [], basics: [], unitOf: () => null, printingOf: () => undefined } as unknown as WantedOverview
    const html = renderToStaticMarkup(<BasicsTab overview={overview} basics={[] as WantedCard[]} separate={false} bundleBasics meta={new Map()} onBought={noop} onOpenList={noop} />)
    expect(textOf(html)).toBe('No basic lands needed.')
  })
})
