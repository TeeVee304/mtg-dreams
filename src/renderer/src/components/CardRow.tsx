import { useEffect, useRef } from 'react'
import { nameKey } from '../../../shared/decklist'
import type { LegalityIssue } from '../../../shared/formats'
import { formatDay, formatEur } from '../format'
import type { PriceDrop } from '../history'
import type { Row } from '../summary'
import { previewHandlers } from './HoverPreview'
import { Icon } from './Icon'
import { Stepper } from './Stepper'

// One row of a deck or wishlist table, and its version cell.

interface CardRowProps {
  row: Row
  /** While choosing a commander: whether this card can be picked. Clicks then pick instead of editing. */
  pick?: 'ok' | 'no'
  onPick: () => void
  /** The deck's commander. */
  leader: boolean
  /** Just chosen as commander. */
  crowned: boolean
  isDeck: boolean
  issue: LegalityIssue | null
  /** Deck copies not covered by the inventory. */
  shortfall: number
  /** A wishlist card that got cheaper since added, past the alert threshold. */
  drop?: PriceDrop | null
  maxQty?: number
  maxTitle?: string
  onQty: (qty: number) => void
  onToggleOwned: () => void
  onOwnedDelta: (delta: number) => void
  onOpen: () => void
  onRemove: () => void
  onRename: (name: string) => void
}

export function CardRow(props: CardRowProps) {
  const { row, pick, onPick, leader, crowned, isDeck, issue, shortfall, drop, maxQty, maxTitle } = props
  const { onQty, onToggleOwned, onOwnedDelta, onOpen, onRemove, onRename } = props
  const { line, entry, resolution, owned, unit } = row
  const printing = resolution?.printing ?? null
  // A typo that Scryfall fuzzy-matched: prices work, but inventory matching needs the real name.
  const data = entry?.data
  const matchedName = data && !data.notFound && nameKey(data.name) !== nameKey(line.name) ? data.name : null
  // The line uses a name printed on some version (e.g. a Marvel reprint) rather than the official one.
  const printedAs = matchedName && data?.printings.some((p) => p.flavorName?.toLowerCase() === line.name.toLowerCase())
  const complete = owned >= line.qty
  const checkbox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = owned > 0 && !complete
  }, [owned, complete])

  const classes = [
    !isDeck && complete && 'owned',
    leader && 'leader',
    crowned && 'crowned',
    pick && `pick-${pick}`
  ].filter(Boolean)

  // While choosing a commander, a click anywhere on the row picks it (and edits nothing).
  return (
    <tr
      className={classes.length ? classes.join(' ') : undefined}
      onClickCapture={
        pick
          ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (pick === 'ok') onPick()
            }
          : undefined
      }
      title={
        pick === 'ok'
          ? `Make ${row.flavorName ?? line.name} the commander`
          : pick === 'no'
            ? "Can't be the commander in this format"
            : undefined
      }
    >
      {!isDeck && (
        <td className="col-owned">
          <div className="owned-cell">
            <input
              ref={checkbox}
              type="checkbox"
              checked={complete}
              onChange={onToggleOwned}
              aria-label={`Own ${line.name}`}
              title={`${row.inventoryQty} in inventory`}
            />
            <span className="owned-count">
              {owned}/{line.qty}
            </span>
            <span className="owned-adjust">
              <button type="button" onClick={() => onOwnedDelta(-1)} disabled={row.inventoryQty === 0} aria-label="One fewer owned">
                −
              </button>
              <button type="button" onClick={() => onOwnedDelta(1)} aria-label="One more owned">
                +
              </button>
            </span>
          </div>
        </td>
      )}
      <td className="col-qty">
        <Stepper
          value={line.qty}
          min={1}
          max={maxQty}
          maxTitle={maxTitle}
          onChange={onQty}
          label={`quantity of ${line.name}`}
        />
      </td>
      <td className="col-name" {...previewHandlers({ src: printing?.imageNormal })}>
        {row.bundledIds ? (
          <span className="card-name" title="Basic lands are bundled: any version counts, for free. Change this in Settings.">
            {line.name}
          </span>
        ) : (
          <button type="button" className="name-btn card-name" onClick={onOpen} title="Card details and version">
            {row.flavorName ?? line.name}
          </button>
        )}
        {row.flavorName && (
          <span className="muted small official-name" title="The card's official name">
            {line.name}
          </span>
        )}
        {line.foil && <span className="chip foil">Foil</span>}
        {issue && (
          <span className={`chip ${issue.severity === 'error' ? 'illegal' : 'restricted'}`} title={issue.message}>
            {issue.message}
          </span>
        )}
        {drop && (
          <span
            className="chip cheaper"
            title={`${formatEur(drop.was)} when added on ${formatDay(drop.since)}, now ${formatEur(row.unit)}`}
          >
            ↓ {drop.percent}% cheaper
          </span>
        )}
        {shortfall > 0 && (
          <span className="chip illegal" title="Decks can only use cards from your inventory">
            {row.inventoryQty === 0 ? 'Not in inventory' : `Only ${row.inventoryQty} owned`}
          </span>
        )}
        {matchedName && (
          <button
            type="button"
            className="chip link fix-name"
            onClick={() => onRename(matchedName)}
            title={
              printedAs
                ? `“${line.name}” is a printed name of “${matchedName}”. Use the official name so your inventory and other versions match.`
                : `Scryfall matched this to “${matchedName}”. Click to use that name.`
            }
          >
            Use “{matchedName}”
          </button>
        )}
      </td>
      <td className="col-version">
        <VersionCell row={row} />
      </td>
      <td className="col-num" title={entry?.data && unit === null ? 'No Cardmarket price for this version and finish' : undefined}>
        {row.bundledIds ? <span className="muted" title="Bundled basic lands count as free">{formatEur(0)}</span> : formatEur(unit)}
        {entry?.data?.staleError && (
          <span className="stale" title={`Showing cached price: ${entry.data.staleError}`}>
            {' '}
            ⚠
          </span>
        )}
      </td>
      <td className="col-num strong">
        {row.bundledIds ? (
          <span className="muted" title="Bundled basic lands count as free">{formatEur(0)}</span>
        ) : unit === null ? (
          '—'
        ) : (
          formatEur(unit * line.qty)
        )}
      </td>
      <td className="col-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onOpen}
          disabled={!!row.bundledIds}
          title={row.bundledIds ? 'Bundled basic land: no versions to choose' : 'Card details and version'}
          aria-label="Card details and version"
        >
          <Icon name="versions" />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={!printing?.cardmarketUrl}
          onClick={() => printing?.cardmarketUrl && window.api.openExternal(printing.cardmarketUrl)}
          title="Open on Cardmarket"
          aria-label="Open on Cardmarket"
        >
          <Icon name="external" />
        </button>
        <button
          type="button"
          className="icon-btn danger-ghost"
          onClick={onRemove}
          title={isDeck ? 'Remove from deck' : 'Remove from list'}
          aria-label={isDeck ? 'Remove from deck' : 'Remove from list'}
        >
          <Icon name="close" />
        </button>
      </td>
    </tr>
  )
}

function VersionCell({ row }: { row: Row }) {
  const { line, entry, resolution } = row
  if (row.bundledIds) {
    return (
      <span className="version" title="Every version of this basic land counts as one generic card">
        <span className="auto-badge">Any version</span>
        {row.bundledIds.length > 1 && <span className="muted">{row.bundledIds.length} lines bundled</span>}
      </span>
    )
  }
  const data = entry?.data
  if (!data) {
    if (entry?.error) return <span className="warn" title={entry.error}>Price unavailable</span>
    return <span className="muted">Loading…</span>
  }
  if (data.notFound) return <span className="warn">Not found on Scryfall</span>
  if (resolution?.pinMissing && data.partial) return <span className="muted">Loading version…</span>
  if (resolution?.pinMissing) {
    return (
      <span className="warn">
        [{line.set?.toUpperCase()}]{line.collector ? ` #${line.collector}` : ''} not found
      </span>
    )
  }
  const printing = resolution?.printing
  if (!printing) return <span className="muted">No paper printings</span>
  const where = `${printing.set.toUpperCase()} #${printing.collectorNumber}`
  if (resolution.collectorMissing) {
    return (
      <span className="version" title={`#${line.collector} is not in ${printing.setName}; using the cheapest copy in that set.`}>
        <span className="set-code">{where}</span>
        <span className="warn small">#{line.collector} not found</span>
      </span>
    )
  }
  const labels = printing.labels.length ? ` — ${printing.labels.join(', ')}` : ''
  if (resolution.fromInventory) {
    return (
      <span className="version" title={`The version in your inventory: ${printing.setName}${labels}`}>
        <span className="auto-badge yours">Yours</span>
        <span className="muted">{where}</span>
      </span>
    )
  }
  return (
    <span className="version" title={`${printing.setName}${labels}`}>
      {resolution.pinned ? <span className="set-code">{where}</span> : <span className="auto-badge">Cheapest</span>}
      <span className="muted">{resolution.pinned ? printing.setName : where}</span>
    </span>
  )
}
