import { useEffect, useMemo, useState } from 'react'
import { cardImageUrl } from '@shared/images'
import { preconEntries, type PreconEntry, type PreconOptions } from '@shared/precons'
import { totalCopies } from '@shared/totals'
import type { PreconCard, PreconDeck, PreconSummary } from '@shared/types'
import { ui } from '@shared/text'
import { cleanError, formatIsoDate } from '../lib/format'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { previewHandlers } from './HoverPreview'
import { Modal } from './Modal'
import { preconDeck, preconIndex } from '../stores/precons'

/** Precon import target: existing wishlist, new wishlist, or new owned deck (cards join the inventory). */
export type PreconTarget = { kind: 'list'; listName: string } | { kind: 'new-list' } | { kind: 'new-deck' } | { kind: 'new-brew' }

/** Props of {@link PreconDialog}. */
interface PreconDialogProps {
  target: PreconTarget
  onAdd: (deck: PreconDeck, entries: PreconEntry[]) => Promise<void> | void
  onClose: () => void
}

/** Max search results shown. */
const MAX_RESULTS = 250

/** Precon search, preview and import. New decks default to exact printings. */
export function PreconDialog({ target, onAdd, onClose }: PreconDialogProps) {
  const [index, setIndex] = useState<PreconSummary[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [deck, setDeck] = useState<PreconDeck | null>(null)
  const [deckError, setDeckError] = useState<string | null>(null)
  const [options, setOptions] = useState<PreconOptions>({ exact: target.kind === 'new-deck', skipBasics: false })
  const { busy, error: addError, run } = useAsyncAction()

  useEffect(() => {
    preconIndex().then(setIndex, (error) => setIndexError(cleanError(error)))
  }, [])

  useEffect(() => {
    if (!selected) return
    let current = true
    setDeck(null)
    setDeckError(null)
    preconDeck(selected).then(
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
  const copies = totalCopies(entries)

  const add = () =>
    run(async () => {
      if (deck) await onAdd(deck, entries)
    })

  const text = ui.precons
  const actionLabel =
    target.kind === 'list'
      ? text.addTo(copies, target.listName)
      : target.kind === 'new-deck'
        ? text.createDeck(copies)
        : text.createList(target.kind === 'new-brew', copies)
  const title = text.titles[target.kind]

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
              {text.skipBasics}
            </label>
            <label className="check" title={text.exactHint}>
              <input
                type="checkbox"
                checked={options.exact}
                onChange={(event) => setOptions({ ...options, exact: event.target.checked })}
              />
              {text.exact}
            </label>
            {target.kind === 'new-deck' && <span className="muted small">{text.addsToInventory}</span>}
          </div>
          <span className="spacer" />
          {addError && <span className="warn small">{addError}</span>}
          <button type="button" onClick={onClose}>
            {ui.dialogs.cancel}
          </button>
          <button type="button" className="primary" disabled={!deck || copies === 0 || busy} onClick={add}>
            {deck ? actionLabel : text.pickDeck}
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
              placeholder={text.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label={text.deckType}>
              <option value="all">{text.allTypes}</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="precon-list" role="listbox" aria-label={text.list}>
            {!index && !indexError && <p className="precon-placeholder">{text.loadingIndex}</p>}
            {indexError && <p className="precon-placeholder warn">{text.indexFailed(indexError)}</p>}
            {index && results.length === 0 && <p className="precon-placeholder">{text.noMatch}</p>}
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
              <p className="precon-placeholder small">{text.showing(MAX_RESULTS, results.length)}</p>
            )}
          </div>
          <p className="muted tiny">{text.source}</p>
        </div>

        <div className="precon-right">
          {!selected && <p className="precon-placeholder">{text.pickToPreview}</p>}
          {selected && !deck && !deckError && <p className="precon-placeholder">{text.loadingDeck}</p>}
          {deckError && <p className="precon-placeholder warn">{text.deckFailed(deckError)}</p>}
          {deck && <DeckPreview deck={deck} skipBasics={options.skipBasics} />}
        </div>
      </div>
    </Modal>
  )
}

/** Decklist preview grouped by board. */
function DeckPreview({ deck, skipBasics }: { deck: PreconDeck; skipBasics: boolean }) {
  const total = totalCopies(deck.cards)
  const boards = (Object.keys(ui.precons.boards) as PreconCard['board'][])
    .map((board) => ({ board, cards: deck.cards.filter((card) => card.board === board) }))
    .filter((group) => group.cards.length > 0)

  return (
    <div className="precon-deck">
      <h3>{deck.name}</h3>
      <p className="muted small">
        {ui.precons.details(deck.type, deck.code, deck.releaseDate ? formatIsoDate(deck.releaseDate) : null, total)}
      </p>
      {boards.map(({ board, cards }) => (
        <section key={board} className="precon-board">
          <h4>
            {ui.precons.boards[board]} ({totalCopies(cards)})
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
              {card.foil && <span className="chip foil">{ui.common.foil}</span>}
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
