import type { DeckSizeCheck } from '@shared/formats'
import { priceBasisLabel } from '@shared/pricing'
import type { PriceBasis } from '@shared/types'
import { formatEur } from '../lib/format'
import type { Summary } from '../lib/summary'

/** Props of {@link ListValueCards}. */
interface ListValueCardsProps {
  isDeck: boolean
  summary: Summary
  /** Main deck copies (sideboard aside). */
  mainCards: number
  /** Decks with a format: main deck size against it. */
  size: DeckSizeCheck | null
  /** Card line count (not copies). */
  lines: number
  /** Main deck land copies. */
  lands: number
  /** Sideboard copies. */
  sideboard: number
  basis: PriceBasis
}

/** Value stats: deck value, or wishlist remaining cost and owned share. */
export function ListValueCards({ isDeck, summary, mainCards, size, lines, lands, sideboard, basis }: ListValueCardsProps) {
  if (isDeck) {
    const makeup = [size?.note, `${lands} lands · ${mainCards - lands} nonland`, sideboard > 0 && `${sideboard} sideboard`]
    return (
      <section className="stats">
        <Stat label="Deck value" value={formatEur(summary.total)} accent note={priceNote(summary, basis)} />
        <Stat
          label="Cards"
          value={size?.label ?? String(mainCards)}
          warn={size !== null && size.status !== 'ok'}
          note={makeup.filter(Boolean).join(' · ')}
        />
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

/** @returns Note naming the price basis and any loading or unpriced cards. */
function priceNote(summary: Summary, basis: PriceBasis): string {
  const parts = [`${priceBasisLabel(basis)} prices`]
  if (summary.loading) parts.push(`${summary.loading} loading`)
  if (summary.unpriced) parts.push(`${summary.unpriced} without price`)
  return parts.join(' · ')
}

/** Single labeled stat card; `warn` colors the value. */
function Stat({ label, value, accent, warn, note }: { label: string; value: string; accent?: boolean; warn?: boolean; note?: string }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value${warn ? ' warn' : ''}`}>{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}
