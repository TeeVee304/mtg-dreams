import { ui } from '@shared/text'

/** Locale EUR currency formatter; always groups thousands, so 1 234 and 12 345 read alike. */
const eur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', useGrouping: 'always' })

/** @returns Locale EUR string; `—` for null/undefined. */
export function formatEur(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : eur.format(value)
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
  if (minutes < 1) return ui.time.justNow
  if (minutes < 60) return ui.time.minutesAgo(minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 48) return ui.time.hoursAgo(hours)
  return ui.time.daysAgo(Math.round(hours / 24))
}

/**
 * @returns Whether an error says a service could not be reached, did not answer in time or broke off;
 * while offline, the sidebar's offline status says this once instead.
 */
export function isConnectionError(message: string): boolean {
  const { services, offline, slow, stalled, brokeOff } = ui.errors
  return services.some((service) => [offline, slow, stalled, brokeOff].some((error) => message.includes(error(service))))
}

/** @returns A size on disk in KB under 1 MB, otherwise in MB with one decimal. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb < 1 ? ui.settings.kilobytes(Math.max(bytes > 0 ? 1 : 0, Math.round(bytes / 1024))) : ui.settings.megabytes(mb.toFixed(1))
}

/** @returns Error message without Electron's IPC `Error invoking remote method` prefix. */
export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}
