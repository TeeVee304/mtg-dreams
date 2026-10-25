import { listId, listWeights } from '@shared/copies'
import { cardLines, nameKey } from '@shared/decklist'
import { sumOf } from '@shared/totals'
import { featuredTokens, tokenLabel } from '@shared/tokens'
import { ui } from '@shared/text'
import type { CardList, ListRef } from '../../stores/library'
import { useDeckTokens } from '../../stores/tokens'
import { useSettings } from '../../stores/settings'
import { previewHandlers } from '../HoverPreview'
import { Skeleton } from '../Placeholders'
import { ListChips, type ListMeta } from './parts'

/** Props of {@link TokensTab}. */
interface TokensTabProps {
  wishlists: CardList[]
  meta: Map<string, ListMeta>
  onOpenList: (list: ListRef) => void
  onCopy: (text: string, what: string) => void
}

/** Tokens tab: a gallery of the tokens, emblems and helpers wishlist cards create, by the lists that want them. */
export function TokensTab({ wishlists, meta, onOpenList, onCopy }: TokensTabProps) {
  const perList = wishlists.map((list) => ({ name: list.name, keys: new Set(cardLines(list.lines).map((line) => nameKey(line.name))) }))
  const names = [...new Set(wishlists.flatMap((list) => cardLines(list.lines).map((line) => line.name)))]
  const data = useDeckTokens(names)
  const { cardImages } = useSettings()
  if (!data) return <Skeleton width={200} />
  const weights = listWeights(wishlists)
  const weightOf = (name: string) => weights.get(listId({ kind: 'wishlist', name })) ?? 1
  const tokens = featuredTokens(data, names)
    .map((entry) => {
      const lists = perList.filter((list) => entry.makers.some((maker) => list.keys.has(nameKey(maker)))).map((list) => ({ kind: 'wishlist' as const, name: list.name }))
      return { entry, lists, weight: sumOf(lists, (list) => weightOf(list.name)) }
    })
    .sort((a, b) => b.weight - a.weight || a.entry.token.name.localeCompare(b.entry.token.name))
  if (tokens.length === 0) {
    return (
      <div className="empty">
        <p>{data.available ? ui.wanted.tokensTab.none : ui.wanted.tokensTab.unavailable}</p>
      </div>
    )
  }
  return (
    <>
      <div className="wanted-note-row">
        <p className="muted small wanted-note">{ui.wanted.tokensTab.hint}</p>
        <button type="button" onClick={() => onCopy(tokens.map(({ entry }) => tokenLabel(entry)).join('\n'), ui.wanted.tokens)}>
          {ui.wanted.copyAsText}
        </button>
      </div>
      <div className="card-grid token-gallery">
        {tokens.map(({ entry, lists }) => {
          const label = tokenLabel(entry)
          return (
            <div key={entry.key} className={`card-tile token-card ${entry.kind}`}>
              <span
                className="card-tile-image"
                {...previewHandlers({ src: entry.token.imageNormal, back: entry.token.imageBack })}
              >
                {cardImages && entry.token.imageNormal ? (
                  <img src={entry.token.imageNormal} alt={label} loading="lazy" draggable={false} />
                ) : (
                  <span className="card-tile-name-only">{label}</span>
                )}
              </span>
              <span className="token-name">{label}</span>
              <span className="token-makers" title={entry.makers.join(', ')}>
                {entry.makers.join(', ')}
              </span>
              <ListChips lists={lists} meta={meta} onOpenList={onOpenList} />
            </div>
          )
        })}
      </div>
    </>
  )
}
