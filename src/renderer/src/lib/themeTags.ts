import type { ColorFilter } from '@shared/cards'

/** Most theme tags a header shows. */
export const THEME_TAGS = 3

/** Mana colors, colorless aside. */
type ManaColor = Exclude<ColorFilter, 'C'>

/**
 * The colors that own a theme in the color pie, likeliest first, for themes with an obvious owner.
 * Keys are lowercase EDHREC theme names.
 */
const THEME_OWNERS: Record<string, ManaColor[]> = {
  burn: ['R'],
  chaos: ['R'],
  'coin flip': ['R'],
  'group slug': ['R'],
  treasure: ['R'],
  goblins: ['R'],
  dragons: ['R'],
  wheels: ['R', 'U'],
  mill: ['U'],
  spellslinger: ['U', 'R'],
  control: ['U'],
  flash: ['U'],
  wizards: ['U'],
  clones: ['U'],
  theft: ['U'],
  donate: ['U'],
  reanimator: ['B'],
  aristocrats: ['B'],
  sacrifice: ['B'],
  'self-mill': ['B', 'G'],
  zombies: ['B'],
  demons: ['B'],
  vampires: ['B'],
  lifegain: ['W'],
  'pillow fort': ['W'],
  equipment: ['W'],
  angels: ['W'],
  soldiers: ['W'],
  auras: ['W'],
  blink: ['W', 'U'],
  stax: ['W'],
  ramp: ['G'],
  landfall: ['G'],
  lands: ['G'],
  '+1/+1 counters': ['G'],
  elves: ['G'],
  stompy: ['G'],
  'primal surge': ['G'],
  dinosaurs: ['G'],
  hydras: ['G'],
  tokens: ['G', 'W'],
  'group hug': ['G', 'W', 'U']
}

/**
 * @param themes - A commander's themes, as tagged.
 * @param identity - Its color identity, WUBRG order; `['C']` or empty for colorless.
 * @returns A color of the identity for each theme: the color owning the theme when the commander has
 * it, else a color no earlier tag took, so the tags spread over the identity.
 */
export function themeTagColors(themes: string[], identity: ColorFilter[]): ColorFilter[] {
  const colors = identity.filter((color): color is ManaColor => color !== 'C')
  if (colors.length === 0) return themes.map(() => 'C')
  const used = new Set<ManaColor>()
  return themes.map((theme, i) => {
    const owners = (THEME_OWNERS[theme.toLowerCase()] ?? []).filter((color) => colors.includes(color))
    const color =
      owners.find((owner) => !used.has(owner)) ?? owners[0] ?? colors.find((c) => !used.has(c)) ?? colors[i % colors.length]
    used.add(color)
    return color
  })
}

/**
 * @returns How a header names its commanders: one in full; two partners by their short names before
 * the comma (`Okaun & Zndrsplt`), which fit one line.
 */
export function leadersLabel(leaders: string[]): string {
  return leaders.length > 1 ? leaders.map((name) => name.split(',')[0].trim()).join(' & ') : (leaders[0] ?? '')
}
