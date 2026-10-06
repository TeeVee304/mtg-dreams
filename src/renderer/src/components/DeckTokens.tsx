import { featuredTokens, tokenLabel } from '@shared/tokens'
import { useStoredToggle } from '../hooks/useStoredToggle'
import { useSettings } from '../stores/settings'
import { useDeckTokens } from '../stores/tokens'
import { previewHandlers } from './HoverPreview'
import { Skeleton } from './Placeholders'

/** localStorage key of the panel's open state. */
const OPEN_KEY = 'mtg-dreams.tokensOpen'

/**
 * Collapsible tokens panel, closed by default: one tile per distinct token, emblem or helper the
 * cards create, naming the cards that create it. Fetches only while open.
 * @param names - Main deck card names.
 */
export function DeckTokens({ names }: { names: string[] }) {
  const [open, toggle] = useStoredToggle(OPEN_KEY, false)
  const { cardImages } = useSettings()
  const data = useDeckTokens(open ? names : null)
  const tokens = data ? featuredTokens(data, names) : null

  return (
    <section className={`deck-stats deck-tokens${open ? ' open' : ''}`}>
      <button type="button" className="deck-stats-toggle" aria-expanded={open} onClick={toggle}>
        <span className="deck-stats-chevron" aria-hidden="true">
          ›
        </span>
        Tokens
        {tokens && <span className="muted small">{tokens.length}</span>}
      </button>
      {open && (
        <div className="deck-tokens-body">
          {!data || !tokens ? (
            <Skeleton width={160} />
          ) : tokens.length === 0 ? (
            <p className="muted small">
              {data.available ? 'No cards here create tokens, emblems or helpers.' : 'Token data unavailable (Scryfall).'}
            </p>
          ) : (
            <ul className="token-strip">
              {tokens.map((entry) => {
                const label = tokenLabel(entry)
                const makers = entry.makers
                return (
                  <li
                    key={entry.key}
                    className={`token-tile ${entry.kind}`}
                    title={`${label}\nMade by: ${makers.join(', ')}`}
                    {...previewHandlers({ src: entry.token.imageNormal, back: entry.token.imageBack })}
                  >
                    {cardImages && (
                      <span className="token-art">
                        {entry.token.imageSmall && <img src={entry.token.imageSmall} alt="" loading="lazy" draggable={false} />}
                      </span>
                    )}
                    <span className="token-name">{label}</span>
                    <span className="token-makers">
                      {makers[0]}
                      {makers.length > 1 && ` +${makers.length - 1}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
