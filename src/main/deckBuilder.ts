import type { DeckCheck } from '@shared/deckCheck'
import type { DeckPick, Draft } from '@shared/deckDraft'
import { nameKey } from '@shared/decklist'
import { offeredGroups, type CandidatePool } from '@shared/deckPool'
import {
  BUILD_TOOLS,
  buildMessage,
  CHANGE_TOOLS,
  cardLine,
  changeMessage,
  DECK_MODEL,
  readNames,
  readPicks,
  readSearch,
  readText,
  SYSTEM_PROMPT
} from '@shared/deckPrompt'
import { lookUpCards, searchPool, type CardSearch } from '@shared/deckSearch'
import {
  changeDeck,
  completeDeck,
  handedIn,
  NO_USAGE,
  repairDeck,
  type BuiltDeck,
  type DeckProgress,
  type DeckUsage
} from '@shared/deckSession'
import type { CardProfile } from '@shared/mechanics'
import type { LibraryCard } from '@shared/types'
import { CancelledError, type ContentBlock, type Message, type MessageRequest, type MessageResponse, type ToolDefinition } from './anthropic'

/**
 * Builds and changes decks with Claude. Claude reads the brief, plan and shortlist, searches and
 * looks up cards through tools, and hands the deck in; the app checks every hand-in and sends
 * back what to fix. When Claude can't get it right, the app repairs the deck from its own draft
 * and says so.
 *
 * @packageDocumentation
 */

/** What a session needs. */
export interface SessionOptions {
  pool: CandidatePool
  /** The app's own deck, for repairs. */
  draft: Draft
  /** Checks a 99 against the rules and the brief. */
  check: (deck: DeckPick[]) => DeckCheck
  /** Any library card and what it does, by name; undefined if unknown. */
  find: (name: string) => { card: LibraryCard; profile: CardProfile } | undefined
  /** Price on the brief's basis. */
  price: (card: LibraryCard) => number | null
  /** Sends a request to Claude. */
  send: (request: MessageRequest) => Promise<MessageResponse>
  onProgress?: (progress: DeckProgress) => void
  signal?: AbortSignal
}

/** Longest reply Claude may write; a whole deck with reasons fits easily. */
const MAX_TOKENS = 16_000
/** Most requests per build, and per change. */
const MAX_CALLS = { build: 24, change: 12 }
/** Hand-ins with errors before the app repairs the deck itself. */
const MAX_FAILED = 3
/** Cache marker for the prompt prefix. */
const CACHED = { type: 'ephemeral' } as const

/** What a tool call produced. */
interface Outcome {
  content: string
  isError?: boolean
  /** The deck is finished. */
  done?: boolean
}

/** A session's state. */
interface Session {
  mode: 'build' | 'change'
  usage: DeckUsage
  /** The deck as last accepted; null before the first valid hand-in when building. */
  deck: DeckPick[] | null
  check: DeckCheck | null
  /** The last picks handed in, valid or not, for repairs. */
  lastPicks: ReturnType<typeof handedIn> | null
  lastCheck: DeckCheck | null
  summary: string
  notes: string[]
  failed: number
  /** Claude has seen the warnings of a valid deck once. */
  reviewed: boolean
  /** A change was made. */
  changed: boolean
}

/** "€12.50". */
const eur = (value: number) => `€${value.toFixed(2)}`

/** Adds a response's tokens to the running total. */
function addUsage(total: DeckUsage, usage: MessageResponse['usage']): void {
  total.calls++
  total.inputTokens += usage.input_tokens
  total.outputTokens += usage.output_tokens
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0
}

/**
 * Messages with cache markers on the first message (brief, plan and shortlist) and the last, so
 * each request reuses everything before it. Only these two are marked; the API allows four.
 */
function marked(messages: Message[]): Message[] {
  const mark = (message: Message): Message => {
    const blocks = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content
    return { ...message, content: blocks.map((block, i) => (i === blocks.length - 1 ? { ...block, cache_control: CACHED } : block)) }
  }
  return messages.map((message, i) => (i === 0 || i === messages.length - 1 ? mark(message) : message))
}

/** A search in a few words, for progress. */
function describeSearch(search: CardSearch): string {
  const parts = [search.text && `“${search.text}”`, search.type, search.slot && `for ${search.slot}`].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'cards'
}

/** Errors and warnings of a check as a list for Claude. */
function issueList(problems: string[], check: DeckCheck | null): string {
  const errors = [...problems, ...(check?.issues.filter((i) => i.severity === 'error').map((i) => i.message) ?? [])]
  const warnings = check?.issues.filter((i) => i.severity === 'warning').map((i) => i.message) ?? []
  return [
    errors.length > 0 ? `Errors:\n${errors.map((e) => `- ${e}`).join('\n')}` : '',
    warnings.length > 0 ? `Warnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** Runs one tool call. */
function runTool(use: Extract<ContentBlock, { type: 'tool_use' }>, session: Session, options: SessionOptions): Outcome {
  const { pool } = options
  const input = (use.input ?? {}) as Record<string, unknown>
  const progress = (step: DeckProgress['step'], message: string) => options.onProgress?.({ step, message })
  const inDeck = new Set((session.deck ?? []).map((p) => nameKey(p.name)))

  /** Checks a deck; accepts it when it has no errors. */
  const consider = (deck: DeckPick[], problems: string[], picks: ReturnType<typeof handedIn>): { check: DeckCheck; ok: boolean } => {
    progress('checking', 'Checking the deck…')
    const check = options.check(deck)
    session.lastPicks = picks
    session.lastCheck = check
    const ok = problems.length === 0 && !check.issues.some((i) => i.severity === 'error')
    if (ok) {
      session.deck = deck
      session.check = check
    } else {
      session.failed++
      const count = problems.length + check.issues.filter((i) => i.severity === 'error').length
      progress('fixing', `Claude is fixing ${count} ${count === 1 ? 'problem' : 'problems'} the app found…`)
    }
    return { check, ok }
  }

  switch (use.name) {
    case 'search_cards': {
      const search = readSearch(input)
      try {
        const { cards, total } = searchPool(pool, search, inDeck)
        progress('searching', `Claude searched for ${describeSearch(search)}: ${total} found.`)
        if (total === 0) return { content: 'No eligible cards match. Try fewer or other words.' }
        const more = total > cards.length ? ` (showing the best ${cards.length})` : ''
        return { content: `${total} cards match${more}:\n${cards.map(({ entry }) => `- ${cardLine(entry)}`).join('\n')}` }
      } catch (error) {
        return { content: (error as Error).message, isError: true }
      }
    }
    case 'look_up_cards': {
      const names = readNames(input.names)
      if (names.length === 0) return { content: 'Give the names of the cards to look up.', isError: true }
      progress('searching', `Claude looked up ${names.join(', ')}.`)
      const found = lookUpCards(names, pool, options.find, options.price)
      return { content: found.map((f) => ('entry' in f ? `- Eligible: ${cardLine(f.entry)}` : `- Not eligible: ${f.reason}`)).join('\n') }
    }
    case 'submit_deck': {
      if (session.mode === 'change') return { content: 'Use change_deck to change the deck.', isError: true }
      const read = readPicks(input.picks, pool)
      const completed = completeDeck(read.picks, pool)
      const problems = [...read.problems, ...completed.problems]
      const { check, ok } = consider(completed.deck, problems, read.picks)
      if (!ok) return { content: `Not accepted yet.\n${issueList(problems, check)}\nFix the errors and submit the whole deck again.`, done: session.failed >= MAX_FAILED }
      session.summary = readText(input.summary)
      if (readText(input.notes)) session.notes = [readText(input.notes)]
      const warnings = check.issues.filter((i) => i.severity === 'warning')
      if (warnings.length === 0 || session.reviewed) return { content: 'Accepted.', done: true }
      session.reviewed = true
      return {
        content: `The deck is valid: ${check.cards} cards for ${eur(check.total)}.\n${issueList([], check)}\nTo fix any, use change_deck. Otherwise call finish_deck, with notes on the warnings you keep.`
      }
    }
    case 'change_deck': {
      if (!session.deck) return { content: 'Hand the deck in with submit_deck first.', isError: true }
      const remove = (Array.isArray(input.remove) ? input.remove : []).map((name) => readText(name)).filter(Boolean)
      const read = readPicks(input.add ?? [], pool)
      const changed = changeDeck(session.deck, remove, read.picks, pool)
      const problems = [...read.problems, ...changed.problems]
      const previous = { deck: session.deck, check: session.check }
      const { check, ok } = consider(changed.deck, problems, handedIn(changed.deck, pool))
      if (!ok) {
        Object.assign(session, previous)
        return { content: `Not changed.\n${issueList(problems, check)}\nFix the errors and try again.`, done: session.failed >= MAX_FAILED }
      }
      if (readText(input.summary)) session.summary = readText(input.summary)
      if (readText(input.notes)) session.notes.push(readText(input.notes))
      session.changed = true
      return { content: 'Changed.', done: true }
    }
    case 'finish_deck': {
      if (!session.deck) return { content: 'Hand the deck in with submit_deck first.', isError: true }
      if (readText(input.notes)) session.notes.push(readText(input.notes))
      return { content: 'Finished.', done: true }
    }
    default:
      return { content: `There is no tool called ${use.name}.`, isError: true }
  }
}

/**
 * The finished deck from a session, repaired by the app if Claude couldn't build it right.
 * @param answer - Claude's reply when it answered a change request without changing the deck.
 * @throws Error when a change was asked for and Claude neither made it nor answered.
 */
function finish(session: Session, options: SessionOptions, answer?: string): BuiltDeck {
  if (session.mode === 'change' && !session.changed && !answer) throw new Error("Claude couldn't make that change. Try asking in other words.")
  if (session.deck && session.check) {
    const notes = answer ? [...session.notes, answer] : session.notes
    return { picks: session.deck, summary: session.summary, notes, check: session.check, usage: session.usage }
  }
  const { pool, draft } = options
  if (session.lastPicks && session.lastCheck) {
    const repaired = repairDeck(session.lastPicks, session.lastCheck, draft, pool)
    const check = options.check(repaired.deck)
    if (!check.issues.some((i) => i.severity === 'error')) {
      const note = `Claude couldn't get every card right, so MTG Dreams replaced ${repaired.dropped.length > 0 ? repaired.dropped.join(', ') : 'the missing cards'} with its own picks${repaired.added.length > 0 ? `: ${repaired.added.join(', ')}` : ''}.`
      return { picks: repaired.deck, summary: session.summary, notes: [...session.notes, note], check, usage: session.usage }
    }
  }
  return {
    picks: draft.picks,
    summary: '',
    notes: ["Claude didn't finish a valid deck, so this is MTG Dreams' own draft, picked from rules text alone. Try building again."],
    check: options.check(draft.picks),
    usage: session.usage
  }
}

/** Talks with Claude until the deck is finished or the request limit is reached. */
async function converse(session: Session, first: string, tools: ToolDefinition[], options: SessionOptions): Promise<BuiltDeck> {
  const messages: Message[] = [{ role: 'user', content: first }]
  let nudged = false
  while (session.usage.calls < MAX_CALLS[session.mode]) {
    if (options.signal?.aborted) throw new CancelledError()
    options.onProgress?.({
      step: 'choosing',
      message: session.usage.calls === 0 ? 'Claude is reading your brief and choosing cards…' : 'Claude is choosing cards…'
    })
    const response = await options.send({
      model: DECK_MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: CACHED }],
      tools,
      messages: marked(messages)
    })
    addUsage(session.usage, response.usage)
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to work on this deck.')
    messages.push({ role: 'assistant', content: response.content })
    const uses = response.content.filter((block): block is Extract<ContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    if (uses.length === 0) {
      const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text.trim()] : [])).join('\n').trim()
      // A change can be an answer: the player asked a question, or nothing needed changing.
      if (session.mode === 'change' && text) return finish(session, options, text)
      // A valid deck Claude has stopped working on is finished.
      if (session.mode === 'build' && session.deck) return finish(session, options)
      if (nudged) break
      nudged = true
      messages.push({ role: 'user', content: session.mode === 'build' ? 'Hand the deck in with submit_deck.' : 'Make the change with change_deck.' })
      continue
    }
    const results: ContentBlock[] = []
    for (const use of uses) {
      const outcome: Outcome =
        response.stop_reason === 'max_tokens'
          ? { content: 'Your reply was cut off because it was too long. Send it again with shorter reasons.', isError: true }
          : runTool(use, session, options)
      if (outcome.done) return finish(session, options)
      results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.content, ...(outcome.isError && { is_error: true }) })
    }
    messages.push({ role: 'user', content: results })
  }
  return finish(session, options)
}

/** A new session. */
const newSession = (mode: Session['mode']): Session => ({
  mode,
  usage: { ...NO_USAGE },
  deck: null,
  check: null,
  lastPicks: null,
  lastCheck: null,
  summary: '',
  notes: [],
  failed: 0,
  reviewed: false,
  changed: false
})

/**
 * Builds the 99 with Claude from the pool's brief, plan and shortlist.
 * @throws Error in plain words when Claude can't be used; {@link CancelledError} when cancelled.
 */
export function buildWithClaude(options: SessionOptions): Promise<BuiltDeck> {
  return converse(newSession('build'), buildMessage(options.pool, offeredGroups(options.pool)), BUILD_TOOLS, options)
}

/**
 * Changes a finished deck as the player asks, or answers their question about it.
 * @param deck - The deck as it is, basic lands included.
 * @throws Error in plain words when Claude can't make the change; {@link CancelledError} when cancelled.
 */
export function changeWithClaude(options: SessionOptions, deck: { picks: DeckPick[]; summary: string }, request: string): Promise<BuiltDeck> {
  const session = newSession('change')
  session.deck = deck.picks
  session.check = options.check(deck.picks)
  session.summary = deck.summary
  return converse(session, changeMessage(options.pool, deck.picks, deck.summary, session.check, request), CHANGE_TOOLS, options)
}
