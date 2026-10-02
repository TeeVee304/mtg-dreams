/** Locale EUR currency formatter. */
const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

/** @returns Locale EUR string; `—` for null/undefined. */
export function formatEur(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : eur.format(value)
}

/** @returns Pluralized count, e.g. `1 card`, `2 cards`. */
export function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

/** @returns Short locale day and month, e.g. `30 Sep`. */
export function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** @returns Relative time: `just now`, minutes, hours (< 48), or days. */
export function timeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** @returns Error message without Electron's IPC `Error invoking remote method` prefix. */
export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
