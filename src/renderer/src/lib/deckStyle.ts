import { createContext, type CSSProperties } from 'react'
import type { DeckPalette, PaletteTokens } from '@shared/deckPalettes'
import { DEFAULT_FACE, TEMPERAMENTS, type Temperament } from '@shared/temperaments'

/** A deck page's palette key and custom properties, for the dialogs that extend it (the card and token views). */
export interface DeckTheme {
  palette: string
  style: CSSProperties
}

/** The deck page's theme, which its card and token views take on though they open outside the page; null off a deck page. */
export const DeckThemeContext = createContext<DeckTheme | null>(null)

/** A display face and its title setting, the app's own when `null`, as custom properties for the deck's `.view`. */
export function temperamentStyle(temperament: Temperament | null): CSSProperties {
  const style = temperament ? TEMPERAMENTS[temperament] : DEFAULT_FACE
  return {
    '--font-display': style.face,
    '--deck-title-size': `${style.size}px`,
    '--deck-title-weight': String(style.weight),
    '--deck-title-case': style.caps ? 'uppercase' : 'none',
    '--deck-title-style': style.slanted ? 'italic' : 'normal',
    // A face without an italic leaves the epigraph to the body face (deck-page.css).
    ...(style.italic && { '--deck-epigraph-font': style.face })
  } as CSSProperties
}

/**
 * A deck palette as the custom properties deck-page.css reads, set on the deck's `.view`. Colors that
 * differ by mode are `light-dark()` pairs, so they follow the app theme with no rule per palette.
 */
export function paletteStyle(palette: DeckPalette): CSSProperties {
  const both = (key: Exclude<keyof PaletteTokens, 'washes'>) => `light-dark(${palette.light[key]}, ${palette.dark[key]})`
  const vars: Record<string, string> = {
    '--deck-ground': both('ground'),
    '--deck-panel': both('panel'),
    '--deck-lead': both('lead'),
    '--deck-text': both('text'),
    '--deck-muted': both('muted'),
    '--deck-line': both('line'),
    '--deck-accent': both('accent'),
    '--deck-accent-text': both('accentText'),
    '--deck-accent-ink': both('accentInk'),
    '--deck-accent-label': both('accentLabel'),
    '--deck-accent-label-fill': both('accentLabelFill'),
    '--deck-track': both('track'),
    '--deck-bad': both('bad'),
    '--deck-warn': both('warn'),
    '--deck-banner': palette.banner.ground,
    '--deck-banner-text': palette.banner.text,
    '--deck-banner-muted': palette.banner.muted,
    '--deck-banner-glass': palette.banner.glass,
    '--deck-banner-button': palette.banner.button
  }
  palette.light.washes.forEach((wash, i) => (vars[`--deck-wash-${i + 1}`] = `light-dark(${wash}, ${palette.dark.washes[i]})`))
  palette.stickers.forEach((sticker, i) => (vars[`--deck-sticker-${i + 1}`] = sticker))
  palette.stickerInks.forEach((ink, i) => (vars[`--deck-sticker-ink-${i + 1}`] = ink))
  return vars as CSSProperties
}
