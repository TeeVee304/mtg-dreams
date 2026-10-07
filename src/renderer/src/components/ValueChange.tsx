import { useEffect, useState } from 'react'
import type { PriceSnapshot } from '@shared/api'
import type { ValuedCopy } from '../lib/collection'
import { formatDate, formatEur } from '../lib/format'
import { valueChange, type ValueMove } from '../stores/history'
import { Segmented } from './Controls'
import { copyLabel } from './InventoryVersions'

const DAY = 24 * 60 * 60 * 1000
/** Selectable comparison ranges. */
const RANGES = [
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 }
] as const
type Range = (typeof RANGES)[number]['id']
/** Top risers and fallers shown. */
const MOVERS = 3

/** Latest snapshot and those in force a week and a month ago. */
interface Snapshots {
  latest: PriceSnapshot
  week: PriceSnapshot
  month: PriceSnapshot
}

/**
 * Inventory value change over a week or month from local price history, with top movers. Counts
 * price changes only, not additions or removals.
 * @param valued - Priced inventory copies.
 * @param ready - All prices loaded.
 */
export function ValueChange({ valued, ready }: { valued: ValuedCopy[]; ready: boolean }) {
  const [range, setRange] = useState<Range>('week')
  const [snapshots, setSnapshots] = useState<Snapshots | 'none' | null>(null)
  const ids = [...new Set(valued.map((v) => v.printing?.cardmarketId).filter((id): id is number => typeof id === 'number'))]
  const idsKey = ids.sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (!ready || !idsKey) return
    let live = true
    const now = Date.now()
    window.api
      .pricesAt(idsKey.split(',').map(Number), [now - 7 * DAY, now - 30 * DAY])
      .then((result) => {
        if (live) setSnapshots(result ? { latest: result.latest, week: result.then[0], month: result.then[1] } : 'none')
      })
      .catch(() => live && setSnapshots('none'))
    return () => {
      live = false
    }
  }, [ready, idsKey])

  if (snapshots === null) return null
  const change = snapshots === 'none' ? null : valueChange(valued, snapshots[range], snapshots.latest)
  const risers = change?.moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, MOVERS) ?? []
  const fallers = change?.moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, MOVERS) ?? []

  return (
    <section className="value-change">
      <Segmented label="Period" tabs options={RANGES} value={range} onChange={setRange} />
      {change ? (
        <>
          <p className="value-change-total">
            <Delta value={change.change} />
            <span className="muted small">
              since {formatDate(change.from)}
            </span>
          </p>
          {(risers.length > 0 || fallers.length > 0) && (
            <div className="movers">
              <Movers title="Biggest rises" moves={risers} />
              <Movers title="Biggest falls" moves={fallers} />
            </div>
          )}
        </>
      ) : (
        <p className="muted small value-change-empty">
          Price changes show up here after Cardmarket&apos;s next daily price update: MTG Dreams keeps its own history
          from the day it first sees your cards.
        </p>
      )}
    </section>
  )
}

/** Signed EUR change. */
function Delta({ value }: { value: number }) {
  const direction = value > 0.005 ? 'up' : value < -0.005 ? 'down' : 'flat'
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '±'
  return (
    <span className={`delta ${direction}`}>
      <span aria-hidden="true">{direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■'}</span>
      {sign}
      {formatEur(Math.abs(value))}
    </span>
  )
}

/** List of top value movers. */
function Movers({ title, moves }: { title: string; moves: ValueMove[] }) {
  return (
    <div>
      <h3 className="value-heading">{title}</h3>
      {moves.length === 0 ? (
        <p className="muted small">None</p>
      ) : (
        <ul className="movers-list">
          {moves.map(({ valued, change }) => (
            <li key={`${valued.name}|${copyLabel(valued.copy)}`}>
              <span className="movers-name">
                <span>{valued.name}</span>
                <span className="muted tiny">
                  {valued.qty > 1 ? `${valued.qty}× ` : ''}
                  {valued.copy.set ? copyLabel(valued.copy) : `cheapest version${valued.copy.foil ? ' · Foil' : ''}`}
                </span>
              </span>
              <Delta value={change} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
