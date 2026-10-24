import { nameKey } from '@shared/decklist'
import { ui } from '@shared/text'
import type { CardLine } from '@shared/types'
import type { SearchChoice } from '../components/CardSearch'

/**
 * @param lines - Card lines of the list as its view plays it.
 * @param cuttable - Whether a card, by nameKey, can be cut there.
 * @returns The cards a version or an upgrade can cut, as search choices, each once with its copies.
 */
export function cutChoices(lines: CardLine[], cuttable: (key: string) => boolean): SearchChoice[] {
  const copies = new Map<string, number>()
  for (const line of lines) {
    if (cuttable(nameKey(line.name))) copies.set(line.name, (copies.get(line.name) ?? 0) + line.qty)
  }
  return [...copies].map(([name, qty]) => ({ name, hint: qty > 1 ? ui.list.add.inTheDeck(qty) : undefined }))
}
