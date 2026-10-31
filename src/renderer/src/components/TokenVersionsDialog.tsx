import { Fragment, useEffect, useState } from 'react'
import type { ColorFilter } from '@shared/cards'
import { tokenInSets, tokenTitle, type FeaturedToken, type TokenInfo } from '@shared/tokens'
import type { SetGroup } from '@shared/setGroups'
import type { ThemeColor } from '@shared/themes'
import { ui } from '@shared/text'
import { MANA_SYMBOLS } from '../lib/artwork'
import { Modal } from './Modal'
import { Skeleton } from './Placeholders'

/** Props of {@link TokenVersionsDialog}. */
interface TokenVersionsDialogProps {
  token: FeaturedToken
  /** The list's Universe: its Versions show first, as a filter. */
  universe?: SetGroup
  /** The list's own color, which marks the default Version and the chosen one. */
  color: ThemeColor | null
  /** Chooses a Version by Scryfall id. */
  onPick: (id: string) => void
  onClose: () => void
}

/**
 * Picks the Version a list shows of a token: every printing Scryfall has, the one its Cards make
 * first (the default, filled in the list's color), then newest first; those of the list's Universe
 * on their own while it has some. The chosen Version is outlined. Tokens are free: no prices show.
 */
export function TokenVersionsDialog({ token, universe, color, onPick, onClose }: TokenVersionsDialogProps) {
  const text = ui.deckTokens.versions
  const [versions, setVersions] = useState<TokenInfo[] | null>(null)
  const ours = versions && universe ? versions.filter((version) => tokenInSets(version, universe.sets)) : []
  const [onlyOurs, setOnlyOurs] = useState(true)
  const listed = versions && (onlyOurs && ours.length > 0 ? ours : versions)
  // The default comes first, whatever the filter.
  const shown = listed && [token.linked, ...listed.filter((version) => version.id !== token.linked.id)]

  useEffect(() => {
    let current = true
    void window.api.getTokenVersions(token.linked.oracleId!).then((found) => current && setVersions(found))
    return () => {
      current = false
    }
  }, [token.linked.oracleId])

  const colors = token.kind === 'token' ? token.token.colors : []
  return (
    <Modal
      title={tokenTitle(token)}
      after={colors.map((mana) => (
        <img key={mana} className="title-mana" src={MANA_SYMBOLS[mana as ColorFilter]} alt={mana} draggable={false} />
      ))}
      size="medium"
      className="token-picker"
      onClose={onClose}
    >
      <div className="token-versions" data-color={color ?? undefined}>
        <p className="muted small">
          {text.madeBy}{' '}
          {token.makers.map((maker, i) => (
            <Fragment key={maker}>
              {i > 0 && (i === token.makers.length - 1 ? ` ${ui.common.andWord} ` : ', ')}
              <i>{maker}</i>
            </Fragment>
          ))}
          {versions && ` ${text.count(versions.length)}`}
        </p>
        {versions && ours.length > 0 && universe && (
          <div className="segmented" role="group">
            <button type="button" className={onlyOurs ? 'selected' : undefined} onClick={() => setOnlyOurs(true)}>
              {text.universe(universe.name, ours.length)}
            </button>
            <button type="button" className={onlyOurs ? undefined : 'selected'} onClick={() => setOnlyOurs(false)}>
              {text.all(versions.length)}
            </button>
          </div>
        )}
        {!shown ? (
          <>
            <p className="muted small">{text.loading}</p>
            <Skeleton width={240} />
          </>
        ) : shown.length === 1 && versions?.length === 0 ? (
          <p className="muted small">{text.none}</p>
        ) : (
          <ul className="token-version-grid">
            {shown.map((version) => {
              const selected = version.id === token.token.id
              const linked = version.id === token.linked.id
              return (
                <li key={version.id}>
                  <button
                    type="button"
                    className={`token-version${selected ? ' selected' : ''}${linked ? ' linked' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onPick(version.id)}
                    title={version.setName}
                  >
                    <span className="token-art">
                      {version.imageSmall && <img src={version.imageSmall} alt="" loading="lazy" draggable={false} />}
                    </span>
                    <span className="small">
                      {version.set?.toUpperCase()} #{version.collector}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
