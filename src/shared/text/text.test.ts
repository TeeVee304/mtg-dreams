import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Guards the text catalog: the app's text lives in `shared/text`, not in the code, and the
 * catalog keeps the app's terms capitalized.
 */

const SRC = join(__dirname, '..', '..')

/** The app's source files, tests and the catalog itself aside. */
function sourceFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$|\.d\.ts$/.test(name)) files.push(path)
    }
  }
  for (const dir of ['renderer/src', 'shared', 'main']) walk(join(SRC, dir))
  return files.filter((path) => !relative(SRC, path).replaceAll('\\', '/').startsWith('shared/text/'))
}

/**
 * Text that stays in the code, by file: what the app reads back (file headers, keys, queries) and
 * Magic's own vocabulary that doubles as data. `true` allows a whole file of such data.
 */
const ALLOWED: Record<string, true | string[]> = {
  // Drawings: SVG paths and flag colors.
  'renderer/src/components/Icon.tsx': true,
  'renderer/src/components/LanguageFlag.tsx': true,
  'renderer/src/features/deckWizard/WizardHat.tsx': true,
  // Magic's vocabulary: colors, card types, guilds and shards, basic lands, languages, formats, precon
  // kinds, Commander brackets, subtypes. Formats are also read back by name from list files.
  'shared/cards.ts': true,
  'shared/colorIdentity.ts': true,
  'shared/basics.ts': true,
  'shared/languages.ts': true,
  // Magic's Companions and keywords, and the Companion and Rulebreaker color headers of list files.
  'shared/deckRules.ts': true,
  // Magic's worlds, named as Preferred Versions in list files.
  'shared/setGroups.ts': true,
  'shared/formats.ts': ['Standard', 'Pioneer', 'Modern', 'Premodern', 'Legacy', 'Vintage', 'Pauper', 'Old School', 'Commander',
    'Duel Commander', 'Pauper Commander', 'Oathbreaker', 'PreDH', 'Alchemy', 'Historic', 'Timeless', 'Brawl', 'Standard Brawl', '// Commander: {}', 'Creature', 'Vehicle', 'Spacecraft',
    'Friends forever', 'Time', 'Lord', 'Doctor'],
  'main/precons.ts': ['Arena Starter Deck', 'Arena Starter Kit', 'Arena Promotional Deck', 'Historic Brawl Precon Deck', 'MTGO Theme Deck',
    'MTGO Redemption', 'MTGO Commander Deck', 'MTGO Duel Deck', 'Shandalar Enemy Deck', 'Duel Of The Planeswalkers Deck',
    '{} /DeckList.json', '{} /decks/ {} .json', 'Deck name'],
  'shared/deckWizard/averageDeck.ts': ['Exhibition', 'Core', 'Upgraded', 'Optimized'],
  // List files: the headers and markers the app writes and reads back.
  'shared/listMeta.ts': ['Color', 'Unbuilt', 'Upgrade of', 'Upgrade version', 'Preferred Versions', 'Token Versions', 'Energy curve'],
  'shared/listUnbuilt.ts': ['Yes'],
  'shared/listEnergy.ts': ['Yes'],
  'shared/decklist.ts': ['Sideboard', 'Maybeboard', '{Stand-in}'],
  'shared/listVersion.ts': ['Duel', 'Commander', '// {} : On', '// Version: {}'],
  'shared/trade.ts': ['// MTG Dreams trade list: {} ( {} )', '// Have', '// Want', 'card name'],
  'shared/api.ts': ['Changed outside MTG Dreams:'],
  // Ids and keys, not shown as they are.
  'shared/listModel.ts': ['Maybeboard'],
  'renderer/src/App.tsx': ['list/ {} / {}'],
  'renderer/src/components/DeckStats.tsx': ['var(--stat-colorless)', 'max-content repeat( {} , minmax( {} px, {} px))'],
  'renderer/src/stores/history.ts': ['|noub', '|nosl', '|noph'],
  'renderer/src/components/CardSearch.tsx': ['{} -list'],
  'renderer/src/features/deckWizard/DeckWizard.tsx': ['Other'],
  'renderer/src/hooks/useCommanderPicking.ts': ['Background', 'Partner'],
  // The names checks give values they reject, in errors only a bug can raise.
  'shared/settings.ts': ['price basis', 'alert threshold', 'alert amount', 'rules text'],
  'main/storage.ts': ['MTG Dreams', 'MTG Dream', 'MTG Wishlist Tracker', 'list kind', '.txt'],
  'main/ipc.ts': ['cardmarket.com', 'scryfall.com', 'edhrec.com', 'Wishlist order', 'product numbers'],
  'main/deckWizard/index.ts': ['Deck filters', 'Commanders'],
  // Services, as named in their errors, and their queries.
  'main/priceGuide.ts': ['Cardmarket'],
  'main/scryfall.ts': ['Scryfall', '!" {} " game:paper', '( {} ) lang:any -lang:en', '!" {} " lang: {} -is:digital']
}

/** JSX attributes whose values are code, not text. */
const CODE_ATTRIBUTES = new Set(['className', 'id', 'key', 'type', 'role', 'src', 'href', 'htmlFor', 'name', 'value', 'rel', 'target',
  'autoComplete', 'inputMode', 'pattern', 'mode', 'view', 'variant', 'kind', 'size', 'icon', 'tone', 'side', 'sort', 'color', 'method',
  'lang', 'dir', 'accept', 'form', 'list', 'step', 'min', 'max', 'tabIndex', 'draggable', 'spellCheck', 'd', 'fill', 'stroke', 'viewBox',
  'points', 'transform', 'xmlns', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'width', 'height'])
/** Calls whose string arguments are code: lookups, storage keys, IPC channels, selectors, patterns. */
const CODE_CALLS =
  /^(console\.\w+|require|split|includes|startsWith|endsWith|replace|replaceAll|test|match|indexOf|join|padStart|toLocaleString|getItem|setItem|removeItem|handle|invoke|on|send|querySelector|querySelectorAll|closest|addEventListener|removeEventListener|getPath|useStoredValue|useStoredToggle|createElement|getElementById|setAttribute|getAttribute|matchMedia|cacheEntries|cachedFetch|fetchJson|readJson|writeJson|glob|listHeader|text|arrayOf|numbers|cardNames|invalid|RegExp|Intl\.\w+)$/
/** Object keys whose values are code. */
const CODE_KEYS = /^(id|key|kind|type|field|pattern|slug|className|value|page|board|format|base|severity|role)$/

/** @returns Whether `text` reads as words for people, not an id, path, color or query. */
function isWords(text: string): boolean {
  const t = text.trim()
  if (!/[A-Za-z]{2}/.test(t)) return false
  if (/^[a-z][\w-]*$/.test(t) || /^[A-Z0-9_]+$/.test(t)) return false
  if (/^#[0-9a-f]{3,8}$|^\(.*width|^https?:|^mtg-dreams[.:]|^[\w-]+\.(json|tmp|bak|txt)$|^\{\w+\}$|^[a-z][\w:]*:$/i.test(t)) return false
  if (/^[\w./-]+\/[\w./-]*$/.test(t)) return false
  if (/^[a-z][\w-]*( [a-z][\w-]*)+$/.test(t) && t.includes('-')) return false
  return true
}

/** @returns Whether a literal sits where the code reads it rather than shows it. */
function inCode(node: ts.Node): boolean {
  let child: ts.Node = node
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ts.isTypeReferenceNode(parent)) return true
    if (ts.isJsxAttribute(parent)) return CODE_ATTRIBUTES.has(parent.name.getText()) || parent.name.getText().startsWith('data-')
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)) return true
    if (ts.isCaseClause(parent) && parent.expression === child) return true
    if (ts.isPropertyAssignment(parent) && (parent.name === child || CODE_KEYS.test(parent.name.getText()))) return true
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === child) return true
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      const callee = parent.expression.getText()
      return CODE_CALLS.test(callee) || CODE_CALLS.test(callee.split('.').pop() ?? '')
    }
    if (ts.isJsxExpression(parent) || ts.isConditionalExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isBinaryExpression(parent)) continue
    if (ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent) || ts.isArrayLiteralExpression(parent) || ts.isPropertyAssignment(parent)) continue
    if (ts.isVariableDeclaration(parent) || ts.isReturnStatement(parent) || ts.isArrowFunction(parent) || ts.isShorthandPropertyAssignment(parent)) continue
    return false
  }
  return false
}

/** @returns Text written in the code that people see, as `file:line: text` (values in a template as `{}`). */
function inlineText(): string[] {
  const found: string[] = []
  for (const path of sourceFiles()) {
    const file = relative(SRC, path).replaceAll('\\', '/')
    const allowed = ALLOWED[file]
    if (allowed === true) continue
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const report = (node: ts.Node, text: string) => {
      const shown = text.replace(/\s+/g, ' ').trim()
      if (allowed?.includes(shown)) return
      found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${shown}`)
    }
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        if (/[A-Za-z]/.test(node.text)) report(node, node.text)
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (isWords(node.text) && !inCode(node)) report(node, node.text)
      } else if (ts.isTemplateExpression(node)) {
        const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' {} ')
        const words = parts.replaceAll('{}', ' ').trim()
        const prose = /(^|\s)[A-Za-z][a-z]+(\s|[.,:;!?…]|$)/.test(words) && !/^[\w./:#?&=-]*$/.test(words.replace(/\s+/g, ''))
        if (prose && !/^(https?:|\/|#|\.|mtg-dreams)/.test(words) && !inCode(node)) report(node, parts)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return found
}

/** The app's terms, capitalized wherever they name its things. */
const TERMS = /\b(card|commander|deck|land|wishlist|brew|inventory|version|copy|copies|trade|precon|sideboard|maybeboard|partner|background|format|collection|theme|token)(s|es)?\b/
/** Catalog text where a term is plain English: an action, a Card's own name, or a game rule. */
const PLAIN = ['Copy as text', 'Copy image', 'Copy image address', 'Copy', 'colorless', 'Trade list copied. Paste it in a chat with your friend.']

/** @returns The catalog's text with a term in lowercase, as `file:line: text`. */
function lowercaseTerms(): string[] {
  const found: string[] = []
  const dir = join(SRC, 'shared/text/en')
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    const check = (node: ts.Node, text: string) => {
      const match = TERMS.exec(text)
      if (match && match[0][0] === match[0][0].toLowerCase() && !PLAIN.includes(text.trim())) {
        found.push(`en/${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${text.trim()}`)
      }
    }
    const visit = (node: ts.Node) => {
      const isKey = !!node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isImportDeclaration(node.parent) && !isKey) check(node, node.text)
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return found
}

describe('the text catalog', () => {
  it('holds every text the app shows: none is written in the code', () => {
    expect(inlineText()).toEqual([])
  })

  it("capitalizes the app's terms: Card, Deck, Wishlist, Version…", () => {
    expect(lowercaseTerms()).toEqual([])
  })
})
