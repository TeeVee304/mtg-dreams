import { cardLines, nameKey, parseList, serializeList } from '@shared/decklist'
import type { TradeCard, TradeSnapshot } from '@shared/trade'
import type { CardLine, CardQuery, ListLine, ResolvedCard } from '@shared/types'

/**
 * Imported text and trade lists in English: names printed in other languages, and names Scryfall
 * doesn't know on a printing it does, become English names, keeping their language. The card resolver in the main
 * process finds them.
 *
 * @packageDocumentation
 */

/** Asks the card resolver. */
export type Resolve = (queries: CardQuery[]) => Promise<(ResolvedCard | null)[]>

const resolveCards: Resolve = (queries) => window.api.resolveCards(queries)

/**
 * @returns `lines` with each card line named in another language renamed to its English name, with
 * that language unless it has one; a line Scryfall knows by its printing only (an unknown name, with
 * set code and collector number) gets that card's name. Others stay as they are: English names, and
 * near matches (a typo), which the list offers to fix instead. Unchanged if the resolver fails.
 */
export async function localizeLines(lines: ListLine[], resolve: Resolve = resolveCards): Promise<ListLine[]> {
  const cards = cardLines(lines)
  if (cards.length === 0) return lines
  try {
    const byName = await resolve(cards.map((card) => ({ name: card.name })))
    const printed = cards.filter((card, i) => !byName[i] && card.set && card.collector)
    const byPrinting = printed.length > 0 ? await resolve(printed.map((card) => ({ set: card.set!, collector: card.collector! }))) : []
    const renamed = new Map<CardLine, CardLine>()
    cards.forEach((card, i) => {
      const named = byName[i]
      if (named?.lang && !named.fuzzy) renamed.set(card, { ...card, name: named.name, ...(!card.lang && { lang: named.lang }) })
    })
    printed.forEach((card, i) => {
      const found = byPrinting[i]
      if (found) renamed.set(card, { ...card, name: found.name })
    })
    return renamed.size === 0 ? lines : lines.map((line) => (line.kind === 'card' ? (renamed.get(line) ?? line) : line))
  } catch {
    return lines
  }
}

/**
 * @returns A trade list's Cards with names in other languages renamed to English, merging Cards that
 * then share a name; the same Cards if none changed, or the resolver fails. Near matches stay as they are.
 */
export async function localizeTradeCards(cards: TradeCard[], resolve: Resolve = resolveCards): Promise<TradeCard[]> {
  if (cards.length === 0) return cards
  try {
    const answers = await resolve(cards.map((card) => ({ name: card.name })))
    if (!answers.some((answer) => answer?.lang && !answer.fuzzy)) return cards
    const merged = new Map<string, TradeCard>()
    cards.forEach((card, i) => {
      const answer = answers[i]
      const name = answer?.lang && !answer.fuzzy ? answer.name : card.name
      const same = merged.get(nameKey(name))
      if (!same) merged.set(nameKey(name), { ...card, name })
      else {
        same.qty += card.qty
        const worthless = (same.worthless ?? 0) + (card.worthless ?? 0)
        if (worthless > 0) same.worthless = worthless
      }
    })
    return [...merged.values()]
  } catch {
    return cards
  }
}

/** @returns A trade list with {@link localizeTradeCards} applied to its haves and wants. */
export async function localizeSnapshot(snapshot: TradeSnapshot, resolve: Resolve = resolveCards): Promise<TradeSnapshot> {
  const [haves, wants] = await Promise.all([localizeTradeCards(snapshot.haves, resolve), localizeTradeCards(snapshot.wants, resolve)])
  return haves === snapshot.haves && wants === snapshot.wants ? snapshot : { ...snapshot, haves, wants }
}

/** @returns List or inventory text with {@link localizeLines} applied; the same text if no line changed. */
export async function localizeText(text: string, resolve: Resolve = resolveCards): Promise<string> {
  const lines = parseList(text)
  const localized = await localizeLines(lines, resolve)
  return localized === lines ? text : serializeList(localized)
}
