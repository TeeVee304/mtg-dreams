import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { ROLES } from '@shared/mechanics'
import { setEnvironment, SERVICES } from './environment'

const DIR = process.env.MTG_DREAMS_LIBRARY_DIR!
const OUT = process.env.OUT!

it.skipIf(!DIR)('explore', { timeout: 600_000 }, async () => {
  setEnvironment({ ...SERVICES, userData: DIR, documents: DIR, appData: DIR, trash: async () => undefined, userAgent: 'x' })
  const library = await import('./cardLibrary')
  const guide = await import('./priceGuide')
  await Promise.all([library.loadCardLibrary(), guide.loadPriceGuide()])
  const profiles = await library.libraryProfiles()
  const temur = profiles.filter(({ card }) => card.legalities.commander === 'legal' && card.colorIdentity.every((c) => 'GRU'.includes(c)))
  const lines: string[] = [`temur ${temur.length}`]
  for (const role of Object.keys(ROLES)) {
    const hits = temur.filter((p) => p.profile.roles.some((r) => r.id === role && r.weight >= 0.5))
    const cheap = hits.filter((p) => (library.cheapestPrice(p.card, 'trend') ?? 99) <= 20)
    lines.push(`${role}: ${hits.length} (≤€20 ${cheap.length})`)
  }
  const prices = temur.map((p) => library.cheapestPrice(p.card, 'trend'))
  lines.push(`unpriced ${prices.filter((p) => p === null).length}`)
  const sorted = prices.filter((p): p is number => p !== null).sort((a, b) => a - b)
  for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) lines.push(`p${q * 100} €${sorted[Math.floor(q * sorted.length)]}`)
  const pattern = process.env.GREP ? new RegExp(process.env.GREP, 'i') : null
  if (pattern) {
    for (const p of temur.filter((p) => pattern.test(p.card.name) || pattern.test(p.card.text)).slice(0, 80)) {
      lines.push(`- ${p.card.name} €${library.cheapestPrice(p.card, 'trend')} roles=${p.profile.roles.map((r) => `${r.id}:${r.weight}`).join(',')} provides=${p.profile.provides.map((s) => `${s.id}:${s.weight}`).join(',')}`)
      lines.push(`    ${p.card.text.replace(/\n/g, ' | ').slice(0, 220)}`)
    }
  }
  writeFileSync(OUT, lines.join('\n'))
})
