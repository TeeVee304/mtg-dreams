/** Locale EUR currency formatter; always groups thousands, so 1 234 and 12 345 read alike. */
const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', useGrouping: 'always' })

/** @returns Locale EUR string; `—` for null/undefined. */
export function formatEur(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : eur.format(value)
}

/** @returns Pluralized count, e.g. `1 card`, `2 cards`. */
export function cardCount(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

/** @returns Local date as `dd-mm-yyyy`, the app's date format. */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`
}

/** @returns An ISO `yyyy-mm-dd` date as `dd-mm-yyyy`; other text unchanged. */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso
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
