import { listHeader } from './decklist'
import type { ListLine } from './types'

/** Wishlist priority; weights how much its cards count in Most Wanted. */
export type ListPriority = 'high' | 'normal' | 'low'

/** Priority options with UI label, hint and Most Wanted weight. */
export const PRIORITIES: Array<{ id: ListPriority; label: string; hint: string; weight: number }> = [
  { id: 'high', label: 'High', hint: 'Its cards count double in Most Wanted', weight: 2 },
  { id: 'normal', label: 'Normal', hint: 'Its cards count once', weight: 1 },
  { id: 'low', label: 'Low', hint: 'Someday: its cards count half', weight: 0.5 }
]

/** Priority header line stored in the list file: `// Priority: High` or `// Priority: Low`. */
const PRIORITY = listHeader('Priority')

/** @returns Priority named by the first priority header (case-insensitive); `normal` if none or unknown. */
export function listPriority(lines: ListLine[]): ListPriority {
  const value = PRIORITY.read(lines)?.toLowerCase()
  return PRIORITIES.find((option) => option.id === value)?.id ?? 'normal'
}

/** @returns Most Wanted weight of a priority. */
export function priorityWeight(priority: ListPriority): number {
  return PRIORITIES.find((option) => option.id === priority)?.weight ?? 1
}

/**
 * Replaces the priority header, placing it first.
 * @param priority - `normal` removes the header.
 */
export function withPriority(lines: ListLine[], priority: ListPriority): ListLine[] {
  const label = priority === 'normal' ? null : PRIORITIES.find((option) => option.id === priority)?.label
  return PRIORITY.write(lines, label ?? null)
}
