import { priceBasisLabel } from '../../../shared/pricing'
import type { PriceBasis } from '../../../shared/types'
import { formatEur } from '../format'
import type { Summary } from '../summary'

// The value cards at the top of a list: what a deck is worth, or what a wishlist
// still costs and how much of it you own.

interface ListValueCardsProps {
  isDeck: boolean
  summary: Summary
  /** Card lines in the list (not copies). */
  lines: number
  lands: number
  basis: PriceBasis
}

export function ListValueCards({ isDeck, summary, lines, lands, basis }: ListValueCardsProps) {
  if (isDeck) {
    return (
      <section className="stats">
        <Stat label="Deck value" value={formatEur(summary.total)} accent note={priceNote(summary, basis)} />
        <Stat label="Cards" value={String(summary.cards)} note={`${lands} lands · ${summary.cards - lands} nonland`} />
        <Stat label="Unique cards" value={String(lines)} />
      </section>
    )
  }
  const progress = summary.cards ? Math.round((summary.ownedCards / summary.cards) * 100) : 0
  return (
    <section className="stats">
      <Stat label="Still needed" value={formatEur(summary.neededValue)} accent note={priceNote(summary, basis)} />
      <Stat label="List total" value={formatEur(summary.total)} />
      <Stat label="Already owned" value={formatEur(summary.ownedValue)} />
      <div className="stat">
        <span className="stat-label">Collected</span>
        <span className="stat-value">
          {summary.ownedCards} / {summary.cards}
        </span>
        <div className="progress" aria-label={`${progress}% collected`}>
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  )
}

/** Which price the value uses (Settings → Prices), and what's still missing from it. */
function priceNote(summary: Summary, basis: PriceBasis): string {
  const parts = [`${priceBasisLabel(basis)} prices`]
  if (summary.loading) parts.push(`${summary.loading} loading`)
  if (summary.unpriced) parts.push(`${summary.unpriced} without price`)
  return parts.join(' · ')
}

function Stat({ label, value, accent, note }: { label: string; value: string; accent?: boolean; note?: string }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}
