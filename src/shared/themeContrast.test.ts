import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_COLORS } from './themes'

/**
 * Checks the renderer's color tokens (styles/tokens.css) in every theme, light and dark: text
 * colors reach WCAG AA (4.5:1) on the app's surfaces, the fill accent reaches 3:1 (large text,
 * borders, icons) and carries readable ink, and the accent never looks like a warning or an error.
 */

const CSS = readFileSync(join(__dirname, '../renderer/src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

type Vars = Record<string, string>

/** Custom properties of each rule, keyed by selector, from CSS without nested blocks. */
function rules(css: string): Record<string, Vars> {
  const out: Record<string, Vars> = {}
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = (out[selector.trim()] ??= {})
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[name] = value.trim()
  }
  return out
}

const LIGHT_MEDIA = '@media (prefers-color-scheme: light)'
/** The light-mode media blocks' contents, and everything outside them. */
function split(css: string): { dark: string; light: string } {
  let dark = ''
  let light = ''
  let rest = css
  for (let at = rest.indexOf(LIGHT_MEDIA); at >= 0; at = rest.indexOf(LIGHT_MEDIA)) {
    const open = rest.indexOf('{', at)
    let depth = 1
    let i = open + 1
    for (; depth > 0; i++) depth += rest[i] === '{' ? 1 : rest[i] === '}' ? -1 : 0
    dark += rest.slice(0, at)
    light += rest.slice(open + 1, i - 1)
    rest = rest.slice(i)
  }
  return { dark: dark + rest, light }
}

const { dark, light } = split(CSS)
const darkRules = rules(dark)
const lightRules = rules(light)

/** Resolved tokens for a theme color in a mode, cascading :root, light :root, [data-color], light [data-color]. */
function tokens(color: string, mode: 'dark' | 'light'): Vars {
  const theme = `[data-color='${color}']`
  const layers = [darkRules[':root'], darkRules['[data-color]'], darkRules[theme]]
  if (mode === 'light') layers.splice(1, 0, lightRules[':root']), layers.push(lightRules['[data-color]'], lightRules[theme])
  return Object.assign({}, ...layers)
}

type Rgba = [number, number, number, number]

/** Parses #rrggbb, rgba(), or color-mix(in srgb, <color> N%, transparent) with var() lookups. */
function parse(value: string, vars: Vars): Rgba {
  const v = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => vars[name])
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as Rgba
  const rgba = /^rgba\(([^)]+)\)$/.exec(v)
  if (rgba) return rgba[1].split(',').map(Number) as Rgba
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) ([\d.]+)%, transparent\)$/i.exec(v)
  if (mix) {
    const [r, g, b] = parse(mix[1], vars)
    return [r, g, b, Number(mix[2]) / 100]
  }
  throw new Error(`Can't read color ${value}`)
}

/** `top` composited over an opaque `bottom`. */
const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1]

const linear = (c: number): number => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: Rgba): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Distance in OKLab; under about 0.05, two colors read as the same hue. */
function distance(a: Rgba, b: Rgba): number {
  const lab = (c: Rgba): number[] => {
    const [r, g, b] = c.map((x, i) => (i < 3 ? linear(x) : 0))
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [
      0.2104542553 * l + 0.793617931 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ]
  }
  const [x, y] = [lab(a), lab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const SURFACES = ['--bg', '--panel', '--panel-2']
const TEXT = ['--text', '--muted', '--faint', '--accent-text', '--good', '--warn', '--bad']
/** Chips: text on its own tinted background. */
const CHIPS: Array<[string, string]> = [
  ['--accent-text', '--accent-soft'],
  ['--good', '--good-soft'],
  ['--warn', '--warn-soft'],
  ['--bad', '--bad-soft']
]

describe.each(THEME_COLORS.flatMap(({ id }) => (['dark', 'light'] as const).map((mode) => [id, mode] as const)))(
  'theme %s, %s',
  (color, mode) => {
    const vars = tokens(color, mode)
    const color_ = (name: string): Rgba => parse(vars[name], vars)

    it('has readable text on every surface', () => {
      const failures = TEXT.flatMap((text) =>
        SURFACES.map((surface) => [text, surface, contrast(color_(text), color_(surface))] as const).filter(([, , ratio]) => ratio < 4.5)
      )
      expect(failures).toEqual([])
    })

    it('has readable chips', () => {
      const failures = CHIPS.flatMap(([text, tint]) =>
        SURFACES.map((surface) => {
          const ground = over(color_(tint), color_(surface))
          return [text, surface, contrast(color_(text), ground)] as const
        }).filter(([, , ratio]) => ratio < 4.5)
      )
      expect(failures).toEqual([])
    })

    it('has a visible fill accent with readable ink', () => {
      for (const surface of SURFACES) expect(contrast(color_('--accent'), color_(surface))).toBeGreaterThanOrEqual(3)
      expect(contrast(color_('--accent-ink'), color_('--accent'))).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the accent apart from warnings and errors', () => {
      for (const accent of ['--accent', '--accent-text']) {
        expect(distance(color_(accent), color_('--warn'))).toBeGreaterThan(0.05)
        expect(distance(color_(accent), color_('--bad'))).toBeGreaterThan(0.05)
      }
      expect(distance(color_('--warn'), color_('--bad'))).toBeGreaterThan(0.05)
    })
  }
)
