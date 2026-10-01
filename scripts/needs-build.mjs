// Used by "mtg-dreams.bat": exits 0 when the build in out/ is newer than every
// source file, 1 when the app needs rebuilding (or has never been built).
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outputs = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']
const inputs = [
  'src',
  'resources',
  'package.json',
  'package-lock.json',
  'electron.vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.web.json'
]

function newest(path) {
  const stats = statSync(path)
  if (!stats.isDirectory()) return stats.mtimeMs
  return Math.max(0, ...readdirSync(path).map((name) => newest(join(path, name))))
}

const outPaths = outputs.map((file) => join(root, file))
if (!outPaths.every((path) => existsSync(path))) process.exit(1)

const built = Math.min(...outPaths.map((path) => statSync(path).mtimeMs))
const changed = Math.max(...inputs.map((file) => join(root, file)).filter(existsSync).map(newest))
process.exit(changed > built ? 1 : 0)
