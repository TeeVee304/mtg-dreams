import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The services status reads, as stand-ins. */
const deps = vi.hoisted(() => ({
  guideDate: null as number | null,
  refresh: vi.fn(async () => true),
  ensureLibrary: vi.fn(async () => undefined),
  loadDecks: vi.fn(async () => [])
}))
vi.mock('../priceGuide', () => ({
  loadPriceGuide: async () => undefined,
  priceGuideDate: () => deps.guideDate,
  refreshPriceGuide: deps.refresh
}))
vi.mock('./cardLibrary', () => ({
  loadCardLibrary: async () => undefined,
  ensureCardLibrary: deps.ensureLibrary,
  cardLibraryStatus: () => ({ state: 'ready', cards: 30_000, updatedAt: '2026-10-09' })
}))
vi.mock('./community', () => ({
  loadCommunityDecks: deps.loadDecks,
  communityDecks: () => [{ id: 'a' }, { id: 'b' }],
  communityLoading: () => false,
  communityFailed: () => 1
}))

const { deckHelperStatus, ensurePrices, prepareDeckHelper, setPriceRefresher } = await import('./status')

beforeEach(() => {
  deps.guideDate = null
  vi.clearAllMocks()
  setPriceRefresher(deps.refresh)
})

describe('what the wizard needs', () => {
  it('gets a price guide only when none is saved, the way it was told to', async () => {
    const askMain = vi.fn(async () => undefined)
    setPriceRefresher(askMain)
    await ensurePrices()
    expect(askMain).toHaveBeenCalledTimes(1)
    deps.guideDate = 1
    await ensurePrices()
    expect(askMain).toHaveBeenCalledTimes(1)
    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it('starts every download at once, and reports the library, the precons and the last failure', async () => {
    deps.ensureLibrary.mockRejectedValueOnce(new Error('Scryfall is unavailable.'))
    expect(await prepareDeckHelper()).toMatchObject({ library: { state: 'ready' }, precons: { decks: 2, loading: false, failed: 1 } })
    expect(deps.loadDecks).toHaveBeenCalled()
    await vi.waitFor(() => expect(deckHelperStatus().error).toBe('Scryfall is unavailable.'))
  })
})
