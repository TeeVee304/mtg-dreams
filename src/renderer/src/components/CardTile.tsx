import type { LegalityIssue } from '@shared/formats'
import { shortfallNote } from '@shared/listModel'
import { formatEur } from '../lib/format'
import type { Row } from '../lib/summary'
import { Icon } from './Icon'

/** Props of {@link CardTile}. */
interface CardTileProps {
  row: Row
  isDeck: boolean
  /** Commander picking mode: whether this card is eligible. */
  pick?: 'ok' | 'no'
  /** Card is the commander. */
  leader: boolean
  /** Just chosen as commander (animation). */
  crowned: boolean
  issue: LegalityIssue | null
  /** Deck copies not covered by the inventory copies left by lists ahead. */
  shortfall: number
  onOpen: () => void
  onPick: () => void
}

/** Grid view card: image with quantity, owned state and issue badges; name and price below. Click opens or picks. */
export function CardTile({ row, isDeck, pick, leader, crowned, issue, shortfall, onOpen, onPick }: CardTileProps) {
  const { line, resolution, entry, owned, unit } = row
  const printing = resolution?.printing ?? null
  const image = printing?.imageNormal ?? printing?.imageSmall
  const name = row.flavorName ?? line.name
  const loading = !row.bundledIds && !entry?.data && !entry?.error
  const complete = owned >= line.qty
  const problem = issue?.message ?? (shortfall > 0 ? shortfallNote(row).label : null)
  /** Badge text: copies covered out of those in the deck for a shortfall, else the issue kind. */
  const badge = issue ? (issue.severity === 'warning' ? 'Restricted' : 'Illegal') : `${line.qty - shortfall}/${line.qty}`
  const price = unit === null ? null : unit * line.qty

  const classes = [
    'card-tile',
    !isDeck && complete && 'owned',
    leader && 'leader',
    crowned && 'crowned',
    pick && `pick-${pick}`
  ].filter(Boolean)

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={pick ? () => pick === 'ok' && onPick() : onOpen}
      disabled={!!row.bundledIds && !pick}
      title={
        pick === 'ok'
          ? `Make ${name} the commander`
          : pick === 'no'
            ? "Can't be the commander in this format"
            : row.bundledIds
              ? 'Bundled basic land: any version counts, for free'
              : name
      }
    >
      <span className={`card-tile-image${loading ? ' skeleton' : ''}`}>
        {image ? <img src={image} alt="" loading="lazy" draggable={false} /> : !loading && <span className="card-tile-name-only">{name}</span>}
        {line.foil && <span className="card-tile-foil" aria-hidden="true" />}
        {line.qty > 1 && <span className="card-tile-qty">×{line.qty}</span>}
        {!isDeck && (
          <span className={`card-tile-owned${complete ? ' done' : ''}`} title={`${owned} of ${line.qty} owned`}>
            {complete ? <Icon name="check" /> : `${owned}/${line.qty}`}
          </span>
        )}
        {problem && (
          <span className={`card-tile-problem${issue?.severity === 'warning' ? ' warning' : ''}`} title={problem}>
            <span aria-hidden="true">{badge}</span>
            <span className="sr-only">{problem}</span>
          </span>
        )}
        {leader && (
          <span className="card-tile-crown" title="Commander">
            <Icon name="crown" />
          </span>
        )}
      </span>
      <span className="card-tile-meta">
        <span className="card-tile-name">{name}</span>
        <span className="card-tile-price">{loading ? '…' : row.bundledIds ? 'Free' : formatEur(price)}</span>
      </span>
    </button>
  )
}
