/**
 * Color math for the deck palettes: sRGB hex, OKLab, alpha compositing and WCAG contrast.
 *
 * @packageDocumentation
 */

/** An sRGB color, channels 0–255. */
export type Rgb = [number, number, number]

/** @returns The color of `#rrggbb`. */
export function rgbOf(hex: string): Rgb {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb
}

/** @returns `#rrggbb`, channels rounded and clamped. */
export function hexOf(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

/** @returns `rgba(r, g, b, alpha)` of a hex color. */
export function rgba(hex: string, alpha: number): string {
  return `rgba(${rgbOf(hex).join(', ')}, ${alpha})`
}

const linear = (c: number): number => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gamma = (c: number): number => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** @returns OKLab `[L, a, b]`. */
export function oklab(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

/** @returns The hex color of OKLab `[L, a, b]`, clamped to sRGB. */
export function fromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return hexOf([
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ])
}

/** @returns OKLab lightness, 0–1. */
export const lightness = (hex: string): number => oklab(hex)[0]

/** @returns OKLab chroma. */
export function chroma(hex: string): number {
  const [, a, b] = oklab(hex)
  return Math.hypot(a, b)
}

/** @returns OKLab distance; under about 0.02 two colors look the same. */
export function distance(x: string, y: string): number {
  const [p, q] = [oklab(x), oklab(y)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** @returns `top` at `alpha` laid over an opaque `bottom`. */
export function over(top: string, alpha: number, bottom: string): string {
  const [t, b] = [rgbOf(top), rgbOf(bottom)]
  return hexOf(t.map((c, i) => c * alpha + b[i] * (1 - alpha)) as Rgb)
}

/** @returns WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** @returns WCAG contrast ratio, 1–21. */
export function contrast(x: string, y: string): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * APCA lightness contrast (0.0.98G-4g) of text on a background, unsigned: it rates dark text on mid
 * tones lower than WCAG does, so it picks between a dark and a light ink as the eye would.
 * @returns |Lc|, 0 to about 106.
 */
export function apca(text: string, background: string): number {
  const clamp = (y: number) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414)
  const [t, b] = [clamp(luminance(text)), clamp(luminance(background))]
  const c = (b > t ? b ** 0.56 - t ** 0.57 : b ** 0.65 - t ** 0.62) * 1.14
  if (Math.abs(c) < 0.1) return 0
  return Math.abs(c > 0 ? c - 0.027 : c + 0.027) * 100
}

/**
 * Shifts a color's OKLab lightness, keeping its hue and chroma, until it reaches `target` contrast
 * on every one of `grounds`: darker on light grounds, lighter on dark ones.
 * @returns The color itself when it already does; else the nearest shade or tint that does.
 */
export function tuneToContrast(hex: string, grounds: string[], target: number): string {
  const passes = (color: string) => grounds.every((ground) => contrast(color, ground) >= target)
  if (passes(hex)) return hex
  const [L, a, b] = oklab(hex)
  const step = lightness(grounds[0]) > 0.5 ? -0.005 : 0.005
  for (let l = L + step; l > 0 && l < 1; l += step) {
    const color = fromOklab([l, a, b])
    if (passes(color)) return color
  }
  return step < 0 ? '#000000' : '#ffffff'
}
