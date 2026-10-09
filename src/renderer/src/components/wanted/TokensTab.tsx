import { listId } from '@shared/copies'
import { cardLines, nameKey } from '@shared/decklist'
import { priorityWeight } from '@shared/listPriority'
import { sumOf } from '@shared/totals'
import { featuredTokens, tokenLabel } from '@shared/tokens'
import type { CardList, ListRef } from '../../stores/library'
import { useDeckTokens } from '../../stores/tokens'
import { NameCell } from '../CardCells'
import { Skeleton } from '../Placeholders'
import { ListChips, type ListMeta } from './parts'

/** Props of {@link TokensTab}. */
interface TokensTabProps {
  wishlists: CardList[]
  meta: Map<string, ListMeta>
  onOpenList: (list: ListRef) => void
  onCopy: (text: string, what: string) => void
}

/** Tokens tab: tokens, emblems and helpers wishlist cards create, by the lists that want them. */
export function TokensTab({ wishlists, meta, onOpenList, onCopy }: TokensTabProps) {
  const perList = wishlists.map((list) => ({ name: list.name, keys: new Set(cardLines(list.lines).map((line) => nameKey(line.name))) }))
  const names = [...new Set(wishlists.flatMap((list) => cardLines(list.lines).map((line) => line.name)))]
  const data = useDeckTokens(names)
  if (!data) return <Skeleton width={200} />
  const weightOf = (name: string) => priorityWeight(meta.get(listId({ kind: 'wishlist', name }))?.priority ?? 'normal')
  const tokens = featuredTokens(data, names)
    .map((entry) => {
      const lists = perList.filter((list) => entry.makers.some((maker) => list.keys.has(nameKey(maker)))).map((list) => ({ kind: 'wishlist' as const, name: list.name }))
      return { entry, lists, weight: sumOf(lists, (list) => weightOf(list.name)) }
    })
    .sort((a, b) => b.weight - a.weight || a.entry.token.name.localeCompare(b.entry.token.name))
  if (tokens.length === 0) {
    return (
      <div className="empty">
        <p>{data.available ? 'No wishlist card creates tokens, emblems or helpers.' : 'Token data unavailable (Scryfall).'}</p>
      </div>
    )
  }
  return (
    <>
      <div className="wanted-note-row">
        <p className="muted small wanted-note">Tokens, emblems and helpers your wishlist cards create, owned or not.</p>
        <button type="button" onClick={() => onCopy(tokens.map(({ entry }) => tokenLabel(entry)).join('\n'), 'Tokens')}>
          Copy as text
        </button>
      </div>
      <table className="cards-table wanted-table">
        <thead>
          <tr>
            <th>Token</th>
            <th>Made by</th>
            <th>Wanted in</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map(({ entry, lists }) => (
            <tr key={entry.key}>
              <NameCell images={entry.token}>
                <span className="card-name">{tokenLabel(entry)}</span>
              </NameCell>
              <td className="muted small">{entry.makers.join(', ')}</td>
              <td>
                <ListChips lists={lists} meta={meta} onOpenList={onOpenList} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
