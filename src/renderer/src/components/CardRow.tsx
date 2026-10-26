import { memo, useEffect, useRef } from 'react'
import { nameKey } from '@shared/decklist'
import type { LegalityIssue } from '@shared/formats'
import { heldWhere, shortfallNote } from '@shared/listModel'
import { ui } from '@shared/text'
import { formatDate, formatEur } from '../lib/format'
import { useNarrowTables } from '../hooks/useNarrow'
import type { PriceChange } from '../stores/history'
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
  /** Row is the commander. */
  leader: boolean
  /** Just chosen as commander (animation). */
  crowned: boolean
  isDeck: boolean
  issue: LegalityIssue | null
  /** Deck copies not covered by the inventory copies left by lists ahead. */
  shortfall: number
  /** Wishlist price change past the alert threshold, either way. */
  change?: PriceChange | null
  /** A card only the version shown plays, in that version's view. */
  swapTag?: 'only' | null
  /** Name of that version: `Duel`, `EDH`. */
  swapLabel?: string
  /** The versions you own instead of the one the line names, e.g. `SLD #1 · Foil`; shown on hover over the version. */
  otherVersions?: string | null
  maxQty?: number
  /** Tooltip when `maxQty` is reached. */
  maxTitle?: string
  /** What the row's controls do; the same object every render, so the row re-renders only when its data changes. */
  handlers: RowHandlers
}

/** What a {@link CardRow}'s controls do, given its row. */
export interface RowHandlers {
  /** Picks the card as commander (picking mode). */
  pick: (row: Row) => void
  qty: (row: Row, qty: number) => void
  /** Toggles a wishlist line's owned state. */
  toggleOwned: (row: Row) => void
  /** Adjusts owned copies by `delta`. */
  ownedDelta: (row: Row, delta: number) => void
  /** Opens the card dialog. */
  open: (row: Row) => void
  remove: (row: Row) => void
  /** Renames the line to `name` (e.g. Scryfall's matched name). */
  rename: (row: Row, name: string) => void
}

/**
 * Deck or wishlist table row. Flags fuzzy-matched names (offering a rename to the canonical name,
 * since inventory matching is by name) and flavor names.
 */
export const CardRow = memo(CardRowView, sameRowProps)

/**
 * @returns Whether a row's props are the same: its row and handlers by identity, other values by
 * content (the page computes small objects like the legality issue afresh each render).
 */
function sameRowProps(a: CardRowProps, b: CardRowProps): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof CardRowProps)[])
  for (const key of keys) {
    const [x, y] = [a[key], b[key]]
    if (x === y) continue
    if (key === 'row' || key === 'handlers' || typeof x === 'function' || typeof y === 'function') return false
    if (JSON.stringify(x) !== JSON.stringify(y)) return false
  }
  return true
}

function CardRowView(props: CardRowProps) {
  const { row, pick, leader, crowned, isDeck, issue, shortfall, change, swapTag, swapLabel, maxQty, maxTitle, otherVersions, handlers } = props
  const onPick = () => handlers.pick(row)
  const onQty = (qty: number) => handlers.qty(row, qty)
  const onToggleOwned = () => handlers.toggleOwned(row)
  const onOwnedDelta = (delta: number) => handlers.ownedDelta(row, delta)
  const onOpen = () => handlers.open(row)
  const onRemove = () => handlers.remove(row)
  const onRename = (name: string) => handlers.rename(row, name)
  const { line, entry, resolution, owned, unit } = row
  const narrow = useNarrowTables()
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
            ? ui.card.stopLeading(row.flavorName ?? line.name)
            : ui.card.lead(row.flavorName ?? line.name)
          : pick === 'no'
            ? ui.card.cantLead
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
              aria-label={ui.card.own(line.name)}
              title={ui.card.ownedHint(complete, row.inventoryQty, row.held)}
            />
            <span className="owned-count">
              {owned}/{line.qty}
            </span>
            <span className="owned-adjust">
              <button type="button" onClick={() => onOwnedDelta(-1)} disabled={row.inventoryQty === 0} aria-label={ui.card.oneFewer}>
                −
              </button>
              <button type="button" onClick={() => onOwnedDelta(1)} aria-label={ui.card.oneMore}>
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
          label={ui.card.quantityOf(line.name)}
        />
      </td>
      <NameCell images={printing} loading={loading} foil={line.foil}>
        {row.bundledIds ? (
          <span className="card-name" title={ui.card.bundledHint}>
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
          <span className="muted small official-name" title={ui.card.officialName}>
            {line.name}
          </span>
        )}
        {line.foil && <span className="chip foil">{ui.common.foil}</span>}
        {swapTag === 'only' && (
          <span className="chip duel-only" title={ui.card.onlyIn(swapLabel ?? '')}>
            {ui.card.only(swapLabel ?? '')}
          </span>
        )}
        {issue && (
          <span className={`chip ${issue.severity === 'error' ? 'illegal' : 'restricted'}`} title={issue.message}>
            {issue.message}
          </span>
        )}
        {change && (
          <span
            className={`chip ${change.direction === 'down' ? 'cheaper' : 'pricier'}`}
            title={ui.card.priceChange(formatEur(change.was), formatDate(change.since), formatEur(row.unit))}
          >
            {change.direction === 'down' ? ui.card.cheaper(change.percent) : ui.card.pricier(change.percent)}
          </span>
        )}
        {shortfall > 0 && (
          <span className="chip short" title={shortfallNote(row).title}>
            {shortfallNote(row).label}
          </span>
        )}
        {matchedName && (
          <button
            type="button"
            className="chip link fix-name"
            onClick={() => onRename(matchedName)}
            title={
              printedAs ? ui.card.printedName(line.name, matchedName) : ui.card.matched(matchedName)
            }
          >
            {ui.card.useName(matchedName)}
          </button>
        )}
        {isDeck && row.maybe && owned > 0 && <span className="muted small owned-note">{ui.card.freeCopies(owned)}</span>}
        {!isDeck && row.holders && row.holders.length > 0 && !complete && (
          <span className="muted small owned-note">
            {ui.card.ownedWhere(row.inventoryQty, heldWhere(row.holders, row.inventoryQty))}
          </span>
        )}
        {narrow && (
          <span className="name-version">
            <VersionCell row={row} otherVersions={otherVersions} />
          </span>
        )}
      </NameCell>
      {!narrow && (
        <td className="col-version">
          <VersionCell row={row} otherVersions={otherVersions} />
        </td>
      )}
      <td className="col-num">
        <Price
          unit={loading ? undefined : unit}
          qty={line.qty}
          free={!!row.bundledIds}
          title={entry?.data && unit === null ? ui.card.noPrice : undefined}
        />
        {entry?.data?.staleError && (
          <span className="stale" title={ui.card.cachedPrice(entry.data.staleError)}>
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
          title={ui.card.remove(isDeck)}
          aria-label={ui.card.remove(isDeck)}
        >
          <Icon name="close" />
        </button>
      </td>
    </tr>
  )
}

/**
 * Version cell: plain for the cheapest printing; highlights pinned, owned and missing printings. A
 * pinned printing you own only other versions of says so on hover.
 */
function VersionCell({ row, otherVersions }: { row: Row; otherVersions?: string | null }) {
  const text = ui.card.version
  const yours = otherVersions ? text.ownsOther(otherVersions) : ''
  const { line, entry, resolution } = row
  if (row.bundledIds) {
    return (
      <span className="version" title={text.genericHint}>
        <span className="auto-badge generic">{text.any}</span>
        {row.bundledIds.length > 1 && <span className="muted">{text.bundled(row.bundledIds.length)}</span>}
      </span>
    )
  }
  const data = entry?.data
  if (!data) {
    if (entry?.error) return <span className="warn" title={entry.error}>{text.unavailable}</span>
    return <Skeleton width={120} />
  }
  if (data.notFound) return <span className="warn">{text.notFound}</span>
  if (resolution?.pinMissing && data.partial) return <Skeleton width={120} />
  if (resolution?.pinMissing) {
    return (
      <span className="warn">{text.pinNotFound(`[${line.set?.toUpperCase()}]${line.collector ? ` #${line.collector}` : ''}`)}</span>
    )
  }
  const printing = resolution?.printing
  if (!printing) return <span className="muted">{text.noPaper}</span>
  const where = `${printing.set.toUpperCase()} #${printing.collectorNumber}`
  if (resolution.collectorMissing) {
    return (
      <span className="version" title={text.collectorMissing(line.collector ?? '', printing.setName, yours)}>
        <span className="set-code">{where}</span>
        <span className="warn small">{text.collectorNotFound(line.collector ?? '')}</span>
      </span>
    )
  }
  const labels = printing.labels.length ? ` · ${printing.labels.join(', ')}` : ''
  if (resolution.fromInventory) {
    return (
      <span className="version" title={text.yoursHint(printing.setName, labels)}>
        <span className="auto-badge yours">{text.yours}</span>
        <span className="muted">{where}</span>
      </span>
    )
  }
  if (resolution.preferred && row.preferredFrom) {
    return (
      <span className="version" title={text.preferredHint(row.preferredFrom, printing.setName, labels)}>
        <span className="auto-badge preferred">{row.preferredFrom}</span>
        <span className="muted">{where}</span>
      </span>
    )
  }
  if (!resolution.pinned) {
    return (
      <span className="version" title={text.cheapestHint(printing.setName, labels)}>
        <span className="auto-badge cheapest">{text.cheapest}</span>
        <span className="muted">{where}</span>
      </span>
    )
  }
  return (
    <span className={`version${yours ? ' owns-other' : ''}`} title={`${printing.setName}${labels}${yours}`}>
      <span className="set-code">{where}</span>
      <span className="muted">{printing.setName}</span>
    </span>
  )
}
