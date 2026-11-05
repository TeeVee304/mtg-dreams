import { describe, expect, it } from 'vitest'
import { apca, contrast, distance } from './color'
import { deckPalette, identityKey, PALETTE_GROUPS, PALETTE_KEYS } from './deckPalettes'

/**
 * Checks every deck palette, light and dark: text reaches WCAG AA (4.5:1) on the ground, the panels and
 * every wash; the accent reaches 3:1 as a fill and carries readable ink; the banner, the stickers and
 * the alerts read; and no accent passes for an error or a warning.
 */

describe('deck palettes', () => {
  it('cover every color identity once', () => {
    expect(PALETTE_KEYS).toHaveLength(32)
    expect(new Set(PALETTE_KEYS).size).toBe(32)
    expect(PALETTE_GROUPS.map((group) => group.keys.length)).toEqual([5, 10, 5, 5, 5, 1, 1])
    for (const key of PALETTE_KEYS) expect(deckPalette(key)).not.toBeNull()
  })

  it('key identities in WUBRG order', () => {
    expect(identityKey(['G', 'R'])).toBe('RG')
    expect(identityKey(['G', 'B', 'W'])).toBe('WBG')
    expect(identityKey(['C'])).toBe('C')
    expect(identityKey([])).toBeNull()
  })

  describe.each(PALETTE_KEYS.flatMap((key) => (['light', 'dark'] as const).map((mode) => [key, mode] as const)))('%s, %s', (key, mode) => {
    const palette = deckPalette(key)!
    const t = palette[mode]
    const surfaces = [t.ground, t.panel, t.lead, ...t.washes]
    const below = (color: string, target: number) => surfaces.filter((surface) => contrast(color, surface) < target)

    it('has readable text on every surface', () => {
      expect(below(t.text, 4.5)).toEqual([])
      expect(below(t.muted, 4.5)).toEqual([])
      expect(below(t.accentText, 4.5)).toEqual([])
      expect(below(t.bad, 4.5)).toEqual([])
      expect(below(t.warn, 4.5)).toEqual([])
    })

    it('has a visible fill accent with readable ink', () => {
      expect(contrast(t.accent, t.ground)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.accent, t.panel)).toBeGreaterThanOrEqual(3)
      expect(contrast(t.accentInk, t.accent)).toBeGreaterThanOrEqual(4.5)
      // Bold labels on their fill: WCAG's 4.5:1 and APCA's floor for bold text.
      expect(contrast(t.accentLabel, t.accentLabelFill)).toBeGreaterThanOrEqual(4.5)
      expect(apca(t.accentLabel, t.accentLabelFill)).toBeGreaterThanOrEqual(60)
    })

    it('keeps the accent apart from errors and warnings', () => {
      for (const accent of [t.accent, t.accentText]) {
        expect(distance(accent, t.bad)).toBeGreaterThan(0.06)
        expect(distance(accent, t.warn)).toBeGreaterThan(0.06)
      }
      expect(distance(t.bad, t.warn)).toBeGreaterThan(0.06)
    })

    it('shows four washes that differ from the ground', () => {
      expect(t.washes).toHaveLength(4)
      for (const wash of t.washes) expect(distance(wash, t.ground)).toBeGreaterThan(0.01)
    })

    it('has a readable banner and stickers', () => {
      expect(contrast(palette.banner.text, palette.banner.ground)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.banner.muted, palette.banner.ground)).toBeGreaterThanOrEqual(4.5)
      expect(palette.stickers).toHaveLength(3)
      palette.stickers.forEach((sticker, i) => {
        expect(contrast(palette.stickerInks[i], sticker)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(sticker, palette.banner.ground)).toBeGreaterThanOrEqual(1.6)
      })
    })
  })
})
