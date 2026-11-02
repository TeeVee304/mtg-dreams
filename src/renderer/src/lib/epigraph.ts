/**
 * @param flavor - A card's flavor text, as Scryfall gives it.
 * @returns It as a deck page's epigraph: without its author (a line starting with a dash, or a dash after
 * a closing quote), with curly quotes, which every display face draws.
 */
export function epigraphOf(flavor: string): string {
  const lines = flavor
    .split('\n')
    .filter((line) => !/^\s*[—–-]/.test(line))
    .map((line) => line.replace(/(["”])\s*[—–][^"“”—–]*$/, '$1').trimEnd())
  return lines
    .join('\n')
    .trim()
    .replace(/(^|[\s(\[—–])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s(\[—–])'/g, '$1‘')
    .replace(/'/g, '’')
}
