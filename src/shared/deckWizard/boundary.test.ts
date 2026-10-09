import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Keeps the Deck Wizard a feature of its own: the rest of the app reaches it only through its
 * three entry points, so taking the wizard out means deleting its folders and three lines.
 *
 * @packageDocumentation
 */

const SRC = resolve(__dirname, '../..')
const posix = (path: string) => relative(SRC, path).replace(/\\/g, '/')

/** The wizard's own code. */
const WIZARD = ['main/deckWizard/', 'shared/deckWizard/', 'renderer/src/features/deckWizard/', 'preload/deckWizard.ts']
/** The only wizard modules the rest of the app may import. */
const ENTRIES = ['main/deckWizard/index.ts', 'preload/deckWizard.ts', 'renderer/src/features/deckWizard/index.tsx']

const isWizard = (file: string) => WIZARD.some((prefix) => file.startsWith(prefix))

/** Source files under `src`, relative to it. */
function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [posix(path)] : []
  })
}

/** Modules a file imports, as files under `src` (without extension where the import has none). */
function imports(file: string): string[] {
  const text = readFileSync(join(SRC, file), 'utf8')
  const specs = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  return specs.flatMap((spec) => {
    if (spec.startsWith('@shared/')) return [`shared/${spec.slice(8)}`]
    if (spec.startsWith('.')) return [posix(resolve(join(SRC, dirname(file)), spec))]
    return []
  })
}

/** An entry point as imports name it: without extension, and its folder for an index. */
const importName = (entry: string) => entry.replace(/\.tsx?$/, '').replace(/\/index$/, '')
/** Whether an import names one of the entry points. */
const isEntry = (target: string) => ENTRIES.some((entry) => importName(entry) === target)

describe('the Deck Wizard as a feature of its own', () => {
  const files = sources()

  it('has its code where the boundary expects it', () => {
    for (const entry of ENTRIES) expect(files).toContain(entry)
  })

  it('is reached by the rest of the app through its entry points only', () => {
    const crossings = files
      .filter((file) => !isWizard(file))
      .flatMap((file) => imports(file).filter((target) => isWizard(target) && !isEntry(target)).map((target) => `${file} → ${target}`))
    expect(crossings).toEqual([])
  })

  it('is registered in exactly one place per process', () => {
    const users = (entry: string) => files.filter((file) => !isWizard(file) && imports(file).includes(importName(entry)))
    expect(users('main/deckWizard/index.ts')).toEqual(['main/index.ts'])
    expect(users('preload/deckWizard.ts')).toEqual(['preload/index.ts'])
  })
})
