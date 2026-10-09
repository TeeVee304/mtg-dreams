import { useEffect, useId, useState } from 'react'
import type { CardHit } from '@shared/deckWizard/api'
import { cleanError, formatEur } from '../../lib/format'
import { hidePreview, previewHandlers } from '../../components/HoverPreview'

/** Props of {@link CardSearchBox}. */
interface CardSearchBoxProps {
  /** Accessible name. */
  label: string
  placeholder: string
  search: (query: string) => Promise<CardHit[]>
  onPick: (card: CardHit) => void
  /** Why searching isn't possible right now; enabled when absent. */
  disabled?: string
}

/** Wait after typing before searching. */
const DEBOUNCE_MS = 180

/**
 * Searches cards as you type and offers the matches: name, cost, type and price, with the card
 * image on hover. Arrow keys move through the matches; Enter picks one; Escape clears.
 */
export function CardSearchBox({ label, placeholder, search, onPick, disabled }: CardSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CardHit[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const listId = useId()

  useEffect(() => {
    const text = query.trim()
    if (!text || disabled) {
      setHits([])
      return
    }
    let current = true
    const timer = setTimeout(() => {
      search(text).then(
        (found) => {
          if (!current) return
          setHits(found)
          setActive(0)
          setError(null)
        },
        (e) => current && setError(cleanError(e))
      )
    }, DEBOUNCE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, search, disabled])

  const pick = (card: CardHit) => {
    hidePreview()
    onPick(card)
    setQuery('')
    setHits([])
  }

  return (
    <div className="card-search-box">
      <input
        type="search"
        value={query}
        placeholder={disabled ?? placeholder}
        disabled={!!disabled}
        aria-label={label}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={hits.length > 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && hits.length > 0) {
            event.preventDefault()
            setActive((active + 1) % hits.length)
          } else if (event.key === 'ArrowUp' && hits.length > 0) {
            event.preventDefault()
            setActive((active - 1 + hits.length) % hits.length)
          } else if (event.key === 'Enter' && hits[active]) {
            event.preventDefault()
            pick(hits[active])
          } else if (event.key === 'Escape' && query) {
            event.stopPropagation()
            event.nativeEvent.stopImmediatePropagation()
            setQuery('')
          }
        }}
      />
      {error && <p className="warn small">{error}</p>}
      {query.trim() && !error && hits.length === 0 && <p className="muted small search-none">No matching cards yet.</p>}
      {hits.length > 0 && (
        <ul className="search-hits" id={listId} role="listbox" aria-label={label}>
          {hits.map((card, index) => {
            const preview = previewHandlers({ name: card.name })
            return (
            <li
              key={card.name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : undefined}
              onMouseDown={(event) => {
                event.preventDefault()
                pick(card)
              }}
              onMouseEnter={(event) => {
                setActive(index)
                preview.onMouseEnter(event)
              }}
              onMouseMove={preview.onMouseMove}
              onMouseLeave={preview.onMouseLeave}
            >
              <span className="hit-name">{card.name}</span>
              <span className="hit-cost muted small">{card.manaCost}</span>
              <span className="hit-type muted small">{card.typeLine}</span>
              <span className="hit-price small">{formatEur(card.price)}</span>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
