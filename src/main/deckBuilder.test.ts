import { describe, expect, it } from 'vitest'
import { checkDeck } from '@shared/deckCheck'
import { draftDeck, type DeckPick } from '@shared/deckDraft'
import { BUILD_TOOLS, CHANGE_TOOLS, SYSTEM_PROMPT } from '@shared/deckPrompt'
import { handedIn, type DeckProgress, type SubmittedPick } from '@shared/deckSession'
import { BRIEF, lookup, price, setUp } from '@shared/testDecks'
import { CancelledError, type ContentBlock, type MessageRequest, type MessageResponse } from './anthropic'
import { buildWithClaude, changeWithClaude, type SessionOptions } from './deckBuilder'

/**
 * Tests with a scripted Claude: each reply is set in advance, and the requests are recorded.
 *
 * @packageDocumentation
 */

const { pool, context } = setUp(BRIEF)
const draft = draftDeck(pool)
const PICKS = handedIn(draft.picks, pool)
const check = (deck: DeckPick[]) => checkDeck(deck, { ...context, offered: new Set(pool.eligible.keys()) })

/** A reply from Claude. */
const reply = (content: ContentBlock[], stop: MessageResponse['stop_reason'] = 'tool_use'): MessageResponse => ({
  id: 'msg',
  content,
  stop_reason: stop,
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }
})
/** A tool call. */
const call = (name: string, input: unknown, id = `${name}-${Math.random()}`): ContentBlock => ({ type: 'tool_use', id, name, input })
/** Some text. */
const say = (text: string): ContentBlock => ({ type: 'text', text })
/** The picks with one card swapped for another. */
const swapping = (out: string, card: SubmittedPick): SubmittedPick[] => [...PICKS.filter((p) => p.name !== out), card]
/** A theme card picked by the app, not the player's pet card. */
const THEME_PICK = draft.picks.find((p) => p.slot === 'theme' && !p.reason.startsWith('One of your pet'))!.name

/** A session whose Claude gives `replies` in order, recording requests and progress. */
function scripted(...replies: MessageResponse[]) {
  const requests: MessageRequest[] = []
  const progress: DeckProgress[] = []
  const options: SessionOptions = {
    pool,
    draft,
    check,
    find: lookup,
    price,
    send: async (request) => {
      requests.push(structuredClone(request))
      const next = replies.shift()
      if (!next) throw new Error('Claude was asked more than the script allows.')
      return next
    },
    onProgress: (p) => progress.push(p)
  }
  return { options, requests, progress }
}

/** Text of the tool results in a request's last message. */
const results = (request: MessageRequest) => {
  const last = request.messages.at(-1)!.content
  return typeof last === 'string' ? [last] : last.flatMap((block) => (block.type === 'tool_result' ? [block.content] : []))
}

describe('building a deck with Claude', () => {
  it('lets Claude search, look up, hand in and fix warnings, then returns the checked 99', async () => {
    const { options, requests, progress } = scripted(
      reply([say('Let me look for burn.'), call('search_cards', { text: 'damage', slot: 'route:burn' }), call('look_up_cards', { names: ['Lotus Cobra', 'Path to Exile'] })]),
      reply([call('submit_deck', { picks: swapping(THEME_PICK, { name: 'Blood Moon', slot: 'theme', reason: 'Makes Mountains.' }), summary: 'Burn them out.' })]),
      reply([call('change_deck', { remove: ['Blood Moon'], add: [{ name: 'Bear 1', slot: 'theme', reason: 'A body.' }], notes: 'Swapped Blood Moon: it shuts off Valakut.' })])
    )
    const deck = await buildWithClaude(options)

    expect(deck.picks.reduce((sum, p) => sum + p.qty, 0)).toBe(99)
    expect(deck.picks.map((p) => p.name)).toContain('Bear 1')
    expect(deck.picks.map((p) => p.name)).not.toContain('Blood Moon')
    expect(deck.check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(deck.summary).toBe('Burn them out.')
    expect(deck.notes).toEqual(['Swapped Blood Moon: it shuts off Valakut.'])
    expect(deck.usage).toEqual({ calls: 3, inputTokens: 3000, outputTokens: 600, cacheReadTokens: 2400, cacheWriteTokens: 300 })

    // What Claude was told
    expect(requests[0]).toMatchObject({ model: 'claude-sonnet-5-5', system: [{ text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }] })
    expect(requests[0].tools?.map((t) => t.name)).toEqual(BUILD_TOOLS.map((t) => t.name))
    const [search, lookUp] = results(requests[1])
    expect(search).toMatch(/^\d+ cards match/)
    expect(search).toContain('- Seismic Assault {R}{R}{R}')
    expect(lookUp).toBe("- Eligible: Lotus Cobra {1}{G} · Creature — Snake · €6.00 · jobs: ramp · links: fed by Flubs (lands entering) · “Landfall — Whenever a land you control enters, add one mana of any color.”\n- Not eligible: Path to Exile is outside Flubs, the Fool's colors.")
    expect(results(requests[2])[0]).toContain('Blood Moon turns off the abilities of nonbasic lands — Valakut, the Molten Pinnacle is a land with a special ability.')
    expect(results(requests[2])[0]).toContain('call finish_deck')

    // Only the first and last messages carry cache markers.
    const marks = requests[2].messages.map((m) => typeof m.content !== 'string' && m.content.some((b) => 'cache_control' in b))
    expect(marks).toEqual([true, false, false, false, true])
    expect(progress.map((p) => p.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Claude searched for “damage” for route:burn: \d+ found\.$/), 'Claude looked up Lotus Cobra, Path to Exile.', 'Checking the deck…'])
    )
  })

  it('sends errors back to fix, then accepts a deck without warnings at once', async () => {
    const { options, requests } = scripted(
      reply([call('submit_deck', { picks: swapping(THEME_PICK, { name: 'Path to Exile', slot: 'removal', reason: 'x' }), summary: 'S' })]),
      reply([call('submit_deck', { picks: PICKS, summary: 'Fixed.' })])
    )
    const deck = await buildWithClaude(options)
    expect(results(requests[1])[0]).toMatch(/^Not accepted yet\.\nErrors:\n- Path to Exile is outside Flubs, the Fool's colors\./)
    expect(deck.summary).toBe('Fixed.')
    expect(deck.usage.calls).toBe(2)
  })

  it('repairs the deck itself when Claude keeps getting a card wrong, and says so', async () => {
    const bad = { picks: swapping(THEME_PICK, { name: 'Path to Exile', slot: 'removal', reason: 'x' }), summary: 'S' }
    const { options } = scripted(...[1, 2, 3].map(() => reply([call('submit_deck', bad)])))
    const deck = await buildWithClaude(options)
    expect(deck.check.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(deck.picks.map((p) => p.name)).toContain(THEME_PICK)
    expect(deck.notes).toEqual([`Claude couldn't get every card right, so MTG Dreams replaced Path to Exile with its own picks: ${THEME_PICK}.`])
  })

  it('accepts a valid deck when Claude stops after seeing its warnings', async () => {
    const { options } = scripted(
      reply([call('submit_deck', { picks: swapping(THEME_PICK, { name: 'Blood Moon', slot: 'theme', reason: 'Makes Mountains.' }), summary: 'S' })]),
      reply([say('I’ll keep Blood Moon.')], 'end_turn')
    )
    const deck = await buildWithClaude(options)
    expect(deck.picks.map((p) => p.name)).toContain('Blood Moon')
    expect(deck.check.issues.some((i) => i.message.startsWith('Blood Moon turns off'))).toBe(true)
  })

  it('falls back to the app’s own draft when Claude never hands a deck in', async () => {
    const { options, requests } = scripted(reply([say('Hmm.')], 'end_turn'), reply([say('Still thinking.')], 'end_turn'))
    const deck = await buildWithClaude(options)
    expect(requests[1].messages.at(-1)).toEqual({ role: 'user', content: [{ type: 'text', text: 'Hand the deck in with submit_deck.', cache_control: { type: 'ephemeral' } }] })
    expect(deck.picks).toEqual(draft.picks)
    expect(deck.notes[0]).toMatch(/^Claude didn't finish a valid deck, so this is MTG Dreams' own draft/)
  })

  it('asks again with shorter reasons when a reply is cut off', async () => {
    const { options, requests } = scripted(reply([call('submit_deck', { picks: PICKS.slice(0, 3) }, 'cut')], 'max_tokens'), reply([call('submit_deck', { picks: PICKS, summary: 'S' })]))
    await buildWithClaude(options)
    const last = requests[1].messages.at(-1)!.content as ContentBlock[]
    expect(last[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'cut', is_error: true, content: expect.stringContaining('cut off') })
  })

  it('stops when cancelled, and when Claude refuses', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(buildWithClaude({ ...scripted().options, signal: controller.signal })).rejects.toBeInstanceOf(CancelledError)
    await expect(buildWithClaude(scripted(reply([], 'refusal')).options)).rejects.toThrow('Claude declined to work on this deck.')
  })
})

describe('changing a deck with Claude', () => {
  const deck = { picks: draft.picks, summary: 'Burn them out.' }

  it('makes the change the player asked for, with Claude’s notes', async () => {
    const { options, requests } = scripted(
      reply([call('change_deck', { remove: [THEME_PICK], add: [{ name: 'Bear 1', slot: 'theme', reason: 'A body.' }], notes: 'Added a creature.' })])
    )
    const changed = await changeWithClaude(options, deck, 'More creatures, please.')
    expect(changed.picks.map((p) => p.name)).toContain('Bear 1')
    expect(changed.picks.map((p) => p.name)).not.toContain(THEME_PICK)
    expect(changed.notes).toEqual(['Added a creature.'])
    expect(changed.summary).toBe('Burn them out.')
    expect(requests[0].tools?.map((t) => t.name)).toEqual(CHANGE_TOOLS.map((t) => t.name))
    expect((requests[0].messages[0].content as ContentBlock[])[0]).toMatchObject({ text: expect.stringContaining('# The player asks\nMore creatures, please.') })
  })

  it('answers a question without changing the deck', async () => {
    const { options } = scripted(reply([say('Valakut deals 3 damage whenever a Mountain enters once you have six.')], 'end_turn'))
    const answered = await changeWithClaude(options, deck, 'What does Valakut do?')
    expect(answered.picks).toEqual(draft.picks)
    expect(answered.notes).toEqual(['Valakut deals 3 damage whenever a Mountain enters once you have six.'])
  })

  it('gives up when Claude can’t make a valid change', async () => {
    const bad = { remove: [THEME_PICK], add: [{ name: 'Path to Exile', slot: 'removal', reason: 'x' }], notes: 'n' }
    const { options } = scripted(...[1, 2, 3].map(() => reply([call('change_deck', bad)])))
    await expect(changeWithClaude(options, deck, 'Add Path to Exile.')).rejects.toThrow("Claude couldn't make that change.")
  })
})
