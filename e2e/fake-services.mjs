// Local stand-ins for Scryfall, MTGJSON and Cardmarket's price guide, so end-to-end
// tests run offline and always see the same cards and prices. The app is pointed here
// with the MTG_DREAMS_SCRYFALL_API / _MTGJSON_API / _PRICE_GUIDE_URL variables
// (development builds only).
import { createServer } from 'node:http'

/**
 * Cardmarket's price guide: the prices the app shows. For each card, `market` is the
 * trend; the lowest listing is half of it and the 30-day average 0.10 more.
 */
export const PRICE_GUIDE = { createdAt: '2026-09-30T09:54:57+0200', lastModified: 'Wed, 30 Sep 2026 07:55:13 GMT', rows: [] }

let nextProduct = 1000

// Scryfall's own EUR prices are set to double the guide's, so tests can tell which one is shown.
const card = (name, set, collector, market, extra = {}) => {
  const idProduct = nextProduct++
  PRICE_GUIDE.rows.push({
    idProduct,
    trend: market,
    low: market / 2,
    avg30: market + 0.1,
    'trend-foil': market * 3,
    'low-foil': market,
    'avg30-foil': market * 3
  })
  return scryfallCard(name, set, collector, market * 2, idProduct, extra)
}

const scryfallCard = (name, set, collector, eur, idProduct, extra) => ({
  id: `${set}-${collector}`,
  cardmarket_id: idProduct,
  oracle_id: `oracle-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  set,
  set_name: set.toUpperCase(),
  collector_number: collector,
  rarity: 'rare',
  released_at: '2024-01-01',
  lang: 'en',
  finishes: ['nonfoil', 'foil'],
  prices: { eur: eur.toFixed(2), eur_foil: (eur * 2).toFixed(2) },
  image_uris: {},
  purchase_uris: {},
  scryfall_uri: `https://scryfall.com/card/${set}/${collector}`,
  type_line: 'Artifact',
  color_identity: [],
  cmc: 1,
  legalities: { commander: 'legal', modern: 'legal' },
  oracle_text: '',
  digital: false,
  ...extra
})

export const CARDS = [
  card("Atraxa, Praetors' Voice", 'cm2', '10', 10, {
    type_line: 'Legendary Creature — Phyrexian Angel Horror',
    color_identity: ['W', 'U', 'B', 'G'],
    cmc: 4
  }),
  card('Sol Ring', 'cmm', '1', 1.5),
  card('Llanowar Elves', 'm19', '314', 0.2, { type_line: 'Creature — Elf Druid', color_identity: ['G'], rarity: 'common' }),
  card('Command Tower', 'cmm', '1017', 0.3, { type_line: 'Land', cmc: 0, rarity: 'common' }),
  card('Lightning Bolt', 'a25', '141', 0.5, { type_line: 'Instant', color_identity: ['R'], rarity: 'common' })
]

const DECK_LIST = [{ fileName: 'TestDeck_TST', name: 'Test Deck', code: 'TST', type: 'Commander Deck', releaseDate: '2026-01-01' }]
const TEST_DECK = {
  name: 'Test Deck',
  code: 'TST',
  type: 'Commander Deck',
  releaseDate: '2026-01-01',
  commander: [{ name: "Atraxa, Praetors' Voice", count: 1, setCode: 'CM2', number: '10' }],
  mainBoard: [
    { name: 'Sol Ring', count: 1, setCode: 'CMM', number: '1' },
    { name: 'Island', count: 5, setCode: 'TST', number: '2', supertypes: ['Basic'], types: ['Land'] }
  ]
}

/** Starts both services on a free local port. */
export async function startFakeServices() {
  const hits = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    hits.push(`${req.method} ${url.pathname}`)
    const json = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
    const notFound = () => json(404, { object: 'error' })
    switch (url.pathname) {
      case '/scryfall/cards/search': {
        const q = url.searchParams.get('q') ?? ''
        const exact = /^!"(.+)" game:paper$/.exec(q)?.[1]
        const oracle = /^oracleid:(\S+) game:paper$/.exec(q)?.[1]
        const found = CARDS.filter((c) => c.name === exact || c.oracle_id === oracle)
        return found.length ? json(200, { data: found, has_more: false, total_cards: found.length }) : notFound()
      }
      case '/scryfall/cards/named': {
        const fuzzy = (url.searchParams.get('fuzzy') ?? '').toLowerCase()
        const found = CARDS.find((c) => c.name.toLowerCase().includes(fuzzy))
        return found ? json(200, found) : notFound()
      }
      case '/scryfall/cards/autocomplete': {
        const q = (url.searchParams.get('q') ?? '').toLowerCase()
        return json(200, { data: CARDS.map((c) => c.name).filter((n) => n.toLowerCase().includes(q)) })
      }
      case '/scryfall/cards/collection': {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          const names = JSON.parse(body).identifiers.map((i) => i.name)
          json(200, { data: CARDS.filter((c) => names.includes(c.name)) })
        })
        return
      }
      case '/cardmarket/price_guide_1.json':
        res.writeHead(200, { 'Content-Type': 'application/json', 'Last-Modified': PRICE_GUIDE.lastModified })
        return res.end(
          req.method === 'HEAD'
            ? undefined
            : JSON.stringify({ version: 1, createdAt: PRICE_GUIDE.createdAt, priceGuides: PRICE_GUIDE.rows })
        )
      case '/mtgjson/DeckList.json':
        return json(200, { data: DECK_LIST })
      case '/mtgjson/decks/TestDeck_TST.json':
        return json(200, { data: TEST_DECK })
      default:
        return notFound()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    scryfallApi: `${base}/scryfall`,
    mtgjsonApi: `${base}/mtgjson`,
    priceGuideUrl: `${base}/cardmarket/price_guide_1.json`,
    hits,
    close: () => new Promise((resolve) => server.close(resolve))
  }
}
