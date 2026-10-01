import { useEffect, useMemo, useState } from 'react'
import { cardImageUrl } from '../../../shared/images'
import { preconEntries, type PreconEntry, type PreconOptions } from '../../../shared/precons'
import type { PreconCard, PreconDeck, PreconSummary } from '../../../shared/types'
import { cleanError } from '../format'
import { useAsyncAction } from '../useAsyncAction'
import { previewHandlers } from './HoverPreview'
import { Modal } from './Modal'

/** Add to an existing wishlist, start a new wishlist, or create a deck you own (cards join the inventory). */
export type PreconTarget = { kind: 'list'; listName: string } | { kind: 'new-list' } | { kind: 'new-deck' }

interface PreconDialogProps {
  target: PreconTarget
  onAdd: (deck: PreconDeck, entries: PreconEntry[]) => Promise<void> | void
  onClose: () => void
}

const MAX_RESULTS = 250

const BOARD_TITLES: Record<PreconCard['board'], string> = {
  commander: 'Commander',
  main: 'Main deck',
  side: 'Sideboard',
  other: 'Other cards'
}

export function PreconDialog({ target, onAdd, onClose }: PreconDialogProps) {
  const [index, setIndex] = useState<PreconSummary[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [deck, setDeck] = useState<PreconDeck | null>(null)
  const [deckError, setDeckError] = useState<string | null>(null)
  // A precon you own keeps the printings it came with.
  const [options, setOptions] = useState<PreconOptions>({ exact: target.kind === 'new-deck', skipBasics: false })
  const { busy, error: addError, run } = useAsyncAction()

  useEffect(() => {
    window.api.getPreconIndex().then(setIndex, (error) => setIndexError(cleanError(error)))
  }, [])

  useEffect(() => {
    if (!selected) return
    let current = true
    setDeck(null)
    setDeckError(null)
    window.api.getPrecon(selected).then(
      (result) => current && setDeck(result),
      (error) => current && setDeckError(cleanError(error))
    )
    return () => {
      current = false
    }
  }, [selected])

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of index ?? []) counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [index])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (index ?? []).filter((d) => {
      if (type !== 'all' && d.type !== type) return false
      const haystack = `${d.name} ${d.code} ${d.type} ${d.releaseDate.slice(0, 4)}`.toLowerCase()
      return words.every((word) => haystack.includes(word))
    })
  }, [index, query, type])

  const entries = deck ? preconEntries(deck, options) : []
  const cardCount = entries.reduce((sum, entry) => sum + entry.qty, 0)

  const add = () =>
    run(async () => {
      if (deck) await onAdd(deck, entries)
    })

  const actionLabel =
    target.kind === 'list'
      ? `Add ${cardCount} cards to “${target.listName}”`
      : target.kind === 'new-deck'
        ? `Create deck with ${cardCount} cards`
        : `Create wishlist with ${cardCount} cards`
  const title =
    target.kind === 'new-deck' ? 'New deck from a precon' : target.kind === 'new-list' ? 'New wishlist from a precon' : 'Add a precon'

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="wide"
      footer={
        <>
          <div className="precon-options">
            <label className="check">
              <input
                type="checkbox"
                checked={options.skipBasics}
                onChange={(event) => setOptions({ ...options, skipBasics: event.target.checked })}
              />
              Skip basic lands
            </label>
            <label className="check" title="Pin each card to the printing in the deck instead of the cheapest version">
              <input
                type="checkbox"
                checked={options.exact}
                onChange={(event) => setOptions({ ...options, exact: event.target.checked })}
              />
              Keep the precon's exact printings
            </label>
            {target.kind === 'new-deck' && <span className="muted small">Its cards are also added to your inventory.</span>}
          </div>
          <span className="spacer" />
          {addError && <span className="warn small">{addError}</span>}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!deck || cardCount === 0 || busy} onClick={add}>
            {deck ? actionLabel : 'Pick a deck'}
          </button>
        </>
      }
    >
      <div className="precon-dialog">
        <div className="precon-left">
          <div className="precon-filters">
            <input
              type="search"
              autoFocus
              placeholder="Search by name, set code or year…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Deck type">
              <option value="all">All types</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="precon-list" role="listbox" aria-label="Precons">
            {!index && !indexError && <p className="precon-placeholder">Loading decklists…</p>}
            {indexError && <p className="precon-placeholder warn">Could not load decklists: {indexError}</p>}
            {index && results.length === 0 && <p className="precon-placeholder">No decks match.</p>}
            {results.slice(0, MAX_RESULTS).map((d) => (
              <button
                key={d.fileName}
                type="button"
                role="option"
                aria-selected={selected === d.fileName}
                className={`precon-item${selected === d.fileName ? ' selected' : ''}`}
                onClick={() => setSelected(d.fileName)}
              >
                <span className="precon-name">{d.name}</span>
                <span className="precon-meta">
                  {d.type} · {d.code} · {d.releaseDate.slice(0, 4)}
                </span>
              </button>
            ))}
            {results.length > MAX_RESULTS && (
              <p className="precon-placeholder small">
                Showing {MAX_RESULTS} of {results.length} — refine the search to see more.
              </p>
            )}
          </div>
          <p className="muted tiny">Decklists from MTGJSON</p>
        </div>

        <div className="precon-right">
          {!selected && <p className="precon-placeholder">Pick a deck to see its cards.</p>}
          {selected && !deck && !deckError && <p className="precon-placeholder">Loading decklist…</p>}
          {deckError && <p className="precon-placeholder warn">Could not load this deck: {deckError}</p>}
          {deck && <DeckPreview deck={deck} skipBasics={options.skipBasics} />}
        </div>
      </div>
    </Modal>
  )
}

function DeckPreview({ deck, skipBasics }: { deck: PreconDeck; skipBasics: boolean }) {
  const total = deck.cards.reduce((sum, card) => sum + card.qty, 0)
  const boards = (Object.keys(BOARD_TITLES) as PreconCard['board'][])
    .map((board) => ({ board, cards: deck.cards.filter((card) => card.board === board) }))
    .filter((group) => group.cards.length > 0)

  return (
    <div className="precon-deck">
      <h3>{deck.name}</h3>
      <p className="muted small">
        {deck.type} · {deck.code} · released {deck.releaseDate || 'unknown'} · {total} cards
      </p>
      {boards.map(({ board, cards }) => (
        <section key={board} className="precon-board">
          <h4>
            {BOARD_TITLES[board]} ({cards.reduce((sum, card) => sum + card.qty, 0)})
          </h4>
          {cards.map((card, i) => (
            <div
              key={`${card.name}-${card.set}-${card.collector}-${i}`}
              className={`precon-card${skipBasics && card.basic ? ' skipped' : ''}`}
              {...previewHandlers({ src: card.scryfallId && cardImageUrl(card.scryfallId, 'normal') })}
            >
              <span className="qty">{card.qty}</span>
              <span>
                {card.flavorName ?? card.name}
                {card.flavorName && <span className="muted small official-name">{card.name}</span>}
              </span>
              {card.foil && <span className="chip foil">Foil</span>}
              <span className="where">
                {card.set.toUpperCase()} #{card.collector}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
