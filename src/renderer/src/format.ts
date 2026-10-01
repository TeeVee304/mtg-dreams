const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

export function formatEur(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : eur.format(value)
}

/** "1 card", "2 cards". */
export function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

/** A day, short: "30 Sep". */
export function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function timeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** Strips Electron's "Error invoking remote method 'x': Error:" prefix. */
export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
