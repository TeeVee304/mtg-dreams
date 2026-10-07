import { useEffect, useRef } from 'react'
import { nameKey } from '@shared/decklist'
import type { LegalityIssue } from '@shared/formats'
import { heldWhere, shortfallNote } from '@shared/listModel'
import { formatDate, formatEur } from '../lib/format'
import type { PriceDrop } from '../stores/history'
import type { Row } from '../lib/summary'
import { CardmarketButton, NameCell, Price } from './CardCells'
import { Icon } from './Icon'
import { Skeleton } from './Placeholders'
import { Stepper } from './Stepper'

/** Props of {@link CardRow}. */
interface CardRowProps {
  row: Row
  /** Commander picking mode: whether this card is eligible. Row clicks pick instead of editing. */
  pick?: 'ok' | 'no'
  onPick: () => void
  /** Row is the commander. */
  leader: boolean
  /** Just chosen as commander (animation). */
  crowned: boolean
  isDeck: boolean
  issue: LegalityIssue | null
  /** Deck copies not covered by the inventory copies left by lists ahead. */
  shortfall: number
  /** Wishlist price drop past the alert threshold. */
  drop?: PriceDrop | null
  maxQty?: number
  /** Tooltip when `maxQty` is reached. */
  maxTitle?: string
  onQty: (qty: number) => void
  /** Toggles a wishlist line's owned state. */
  onToggleOwned: () => void
  /** Adjusts owned copies by `delta`. */
  onOwnedDelta: (delta: number) => void
  /** Opens the card dialog. */
  onOpen: () => void
  onRemove: () => void
  /** Renames the line to `name` (e.g. Scryfall's matched name). */
  onRename: (name: string) => void
}

/**
 * Deck or wishlist table row. Flags fuzzy-matched names (offering a rename to the canonical name,
 * since inventory matching is by name) and flavor names.
 */
export function CardRow(props: CardRowProps) {
  const { row, pick, onPick, leader, crowned, isDeck, issue, shortfall, drop, maxQty, maxTitle } = props
  const { onQty, onToggleOwned, onOwnedDelta, onOpen, onRemove, onRename } = props
  const { line, entry, resolution, owned, unit } = row
  const printing = resolution?.printing ?? null
  const data = entry?.data
  const matchedName = data && !data.notFound && nameKey(data.name) !== nameKey(line.name) ? data.name : null
  const printedAs = matchedName && data?.printings.some((p) => p.flavorName?.toLowerCase() === line.name.toLowerCase())
  const complete = owned >= line.qty
  const loading = !row.bundledIds && !data && !entry?.error
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
          ? leader
            ? `Stop using ${row.flavorName ?? line.name} as the commander`
            : `Make ${row.flavorName ?? line.name} the commander`
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
              title={`${row.inventoryQty} in inventory${row.held > 0 ? `; decks and lists ahead of this one claim ${row.held} first` : ''}`}
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
      <NameCell images={printing} loading={loading}>
        {row.bundledIds ? (
          <span className="card-name" title="Basic lands are bundled: any version counts, for free. Change this in Settings.">
            {line.name}
          </span>
        ) : (
          <button
            type="button"
            className="name-btn card-name"
            onClick={onOpen}
            title={row.flavorName ?? line.name}
          >
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
            title={`${formatEur(drop.was)} when added on ${formatDate(drop.since)}, now ${formatEur(row.unit)}`}
          >
            ↓ {drop.percent}% cheaper
          </span>
        )}
        {shortfall > 0 && (
          <span className="chip illegal" title={shortfallNote(row).title}>
            {shortfallNote(row).label}
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
        {!isDeck && row.holders && row.holders.length > 0 && !complete && (
          <span className="muted small owned-note">
            {row.inventoryQty} owned · {heldWhere(row.holders, row.inventoryQty)}
          </span>
        )}
      </NameCell>
      <td className="col-version">
        <VersionCell row={row} />
      </td>
      <td className="col-num">
        <Price
          unit={loading ? undefined : unit}
          qty={line.qty}
          free={!!row.bundledIds}
          title={entry?.data && unit === null ? 'No Cardmarket price for this version and finish' : undefined}
        />
        {entry?.data?.staleError && (
          <span className="stale" title={`Showing cached price: ${entry.data.staleError}`}>
            {' '}
            ⚠
          </span>
        )}
      </td>
      <td className="col-actions">
        <CardmarketButton url={printing?.cardmarketUrl} />
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

/** Version cell: plain for the cheapest printing; highlights pinned, owned and missing printings. */
function VersionCell({ row }: { row: Row }) {
  const { line, entry, resolution } = row
  if (row.bundledIds) {
    return (
      <span className="version" title="Every version of this basic land counts as one generic card">
        <span className="auto-badge generic">Any version</span>
        {row.bundledIds.length > 1 && <span className="muted">{row.bundledIds.length} lines bundled</span>}
      </span>
    )
  }
  const data = entry?.data
  if (!data) {
    if (entry?.error) return <span className="warn" title={entry.error}>Price unavailable</span>
    return <Skeleton width={120} />
  }
  if (data.notFound) return <span className="warn">Not found on Scryfall</span>
  if (resolution?.pinMissing && data.partial) return <Skeleton width={120} />
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
  if (!resolution.pinned) {
    return (
      <span className="version" title={`Cheapest version: ${printing.setName}${labels}`}>
        <span className="muted">{where}</span>
      </span>
    )
  }
  return (
    <span className="version" title={`${printing.setName}${labels}`}>
      <span className="set-code">{where}</span>
      <span className="muted">{printing.setName}</span>
    </span>
  )
}
