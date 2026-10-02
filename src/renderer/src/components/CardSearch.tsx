import { useEffect, useMemo, useRef, useState } from 'react'
import { nameKey } from '../../../shared/decklist'
import { useSettings } from '../settings'
import { CardThumb } from './Placeholders'

/** Local search option. */
export interface SearchChoice {
  name: string
  /** Secondary text. */
  hint?: string
}

/** Props of {@link CardSearch}. */
interface CardSearchProps {
  onPick: (name: string) => void
  placeholder: string
  /** Restricts search to these options instead of Scryfall. Must be memoized. */
  choices?: SearchChoice[]
}

/** DOM id of the search input (Ctrl+K target). */
export const CARD_SEARCH_ID = 'card-search'

/**
 * Card name input with Scryfall autocomplete or local `choices`. In Scryfall mode, Enter without a
 * suggestion submits the raw text (fuzzy-matched later). Suggestion thumbnails load in one batch per
 * suggestion set, skipping known names.
 */
export function CardSearch({ onPick, placeholder, choices }: CardSearchProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const requestSeq = useRef(0)
  /** Suggestion thumbnails by nameKey (when card images are enabled). */
  const [images, setImages] = useState<Record<string, string | null>>({})
  const { cardImages } = useSettings()

  const hints = useMemo(() => new Map(choices?.map((choice) => [choice.name, choice.hint])), [choices])

  useEffect(() => {
    const q = query.trim()
    const seq = ++requestSeq.current
    if (choices) {
      const needle = q.toLowerCase()
      const starts = (name: string) => Number(name.toLowerCase().startsWith(needle))
      setSuggestions(
        needle
          ? choices
              .filter((choice) => choice.name.toLowerCase().includes(needle))
              .map((choice) => choice.name)
              .sort((a, b) => starts(b) - starts(a) || a.localeCompare(b))
              .slice(0, 20)
          : []
      )
      setActive(0)
      setLoading(false)
      return
    }
    if (q.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      window.api
        .autocomplete(q)
        .then((names) => {
          if (seq !== requestSeq.current) return
          setSuggestions(names)
          setActive(0)
          setOpen(true)
        })
        .catch(() => undefined)
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false)
        })
    }, 180)
    return () => clearTimeout(timer)
  }, [query, choices])

  const imagesKey = cardImages ? suggestions.filter((name) => !(nameKey(name) in images)).join('\n') : ''
  useEffect(() => {
    if (!imagesKey) return
    let live = true
    window.api
      .getCardImages(imagesKey.split('\n'))
      .then((found) => live && setImages((known) => ({ ...known, ...found })))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [imagesKey])

  const pick = (name: string) => {
    requestSeq.current += 1
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setLoading(false)
    onPick(name)
  }

  const showList = open && suggestions.length > 0

  return (
    <div className="card-search">
      <input
        id={CARD_SEARCH_ID}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="card-search-list"
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length) {
            event.preventDefault()
            setOpen(true)
            setActive((i) => Math.min(i + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp' && suggestions.length) {
            event.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (showList) pick(suggestions[active])
            else if (!choices && query.trim().length >= 2) pick(query.trim())
          } else if (event.key === 'Escape') {
            if (showList) setOpen(false)
            else setQuery('')
          }
        }}
      />
      {loading && <span className="search-spinner" aria-hidden="true" />}
      {showList && (
        <ul className="suggestions" id="card-search-list" role="listbox">
          {suggestions.map((name, index) => (
            <li
              key={name}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(name)}
            >
              <CardThumb src={images[nameKey(name)]} loading={!(nameKey(name) in images)} />
              <span className="suggestion-name">{name}</span>
              {hints.get(name) && <span className="suggestion-hint">{hints.get(name)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
