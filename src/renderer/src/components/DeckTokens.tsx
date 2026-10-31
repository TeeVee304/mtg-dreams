import { useState } from 'react'
import { savedCardImage } from '@shared/images'
import { listColor } from '@shared/listColor'
import { featuredTokens, tokenName, tokenVersions, type FeaturedToken } from '@shared/tokens'
import type { SetGroup } from '@shared/setGroups'
import { ui } from '@shared/text'
import { useStoredToggle } from '../hooks/useStoredToggle'
import type { CardList, LibraryActions } from '../stores/library'
import { useSettings } from '../stores/settings'
import { useDeckTokens } from '../stores/tokens'
import { Collapsible } from './Collapsible'
import { previewHandlers } from './HoverPreview'
import { Skeleton } from './Placeholders'
import { TokenVersionsDialog } from './TokenVersionsDialog'

/** localStorage key of the panel's open state. */
const OPEN_KEY = 'mtg-dreams.tokensOpen'

/** Props of {@link DeckTokens}. */
interface DeckTokensProps {
  /** Main deck card names. */
  names: string[]
  list: CardList
  actions: LibraryActions
  /** The list's Universe (Preferred Versions), whose token Versions the picker shows first. */
  universe?: SetGroup
}

/**
 * Collapsible tokens panel, closed by default: one tile per distinct token, emblem or helper the
 * cards create, naming the cards that create it, in the Version the list chose (its set tag in the
 * list's color). Clicking a tile picks another Version. Fetches only while open.
 */
export function DeckTokens({ names, list, actions, universe }: DeckTokensProps) {
  const [open, toggle] = useStoredToggle(OPEN_KEY, false)
  const [picking, setPicking] = useState<FeaturedToken | null>(null)
  const { cardImages } = useSettings()
  const chosen = tokenVersions(list.lines)
  const data = useDeckTokens(open ? names : null, [...chosen.values()])
  const tokens = data ? featuredTokens(data, names, chosen) : null
  const text = ui.deckTokens

  return (
    <Collapsible open={open} onToggle={toggle} title={text.title} summary={tokens?.length} className="deck-tokens">
      <div className="deck-tokens-body">
        {!data || !tokens ? (
          <Skeleton width={160} />
        ) : tokens.length === 0 ? (
          <p className="muted small">{data.available ? text.none : text.unavailable}</p>
        ) : (
          <ul className="token-strip">
            {tokens.map((entry) => {
              const label = tokenName(entry)
              const makers = entry.makers
              return (
                <li key={entry.key} {...previewHandlers({ src: entry.token.imageNormal, back: entry.token.imageBack })}>
                  <button
                    type="button"
                    className={`token-tile ${entry.kind}`}
                    title={label}
                    aria-label={text.chooseVersion(label)}
                    onClick={() => setPicking(entry)}
                    disabled={!entry.linked.oracleId}
                  >
                    {cardImages && (
                      <span className="token-art">
                        {entry.token.imageSmall && <img src={savedCardImage(entry.token.imageSmall)} alt="" loading="lazy" draggable={false} />}
                        {entry.token.set && (
                          <span className={`token-set${entry.chosen ? ' chosen' : ''}`}>{entry.token.set.toUpperCase()}</span>
                        )}
                      </span>
                    )}
                    <span className="token-name">{label}</span>
                    <span className="token-makers">
                      {makers[0]}
                      {makers.length > 1 && ` +${makers.length - 1}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {picking?.linked.oracleId && (
        <TokenVersionsDialog
          token={picking}
          universe={universe}
          color={listColor(list.lines)}
          onPick={(id) => {
            const oracleId = picking.linked.oracleId!
            actions.setTokenVersion(list, oracleId, id === picking.linked.id ? null : id, tokenName(picking))
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Collapsible>
  )
}
