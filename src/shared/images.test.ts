import { describe, expect, it } from 'vitest'
import { savedCardImage } from './images'

const ID = '0a1b2c3d-0000-4000-8000-000000000000'

describe('savedCardImage', () => {
  it('serves small Scryfall card images from the saved ones, without their version query', () => {
    expect(savedCardImage(`https://cards.scryfall.io/small/front/0/a/${ID}.jpg?1562`)).toBe(`card-image://scryfall/small/front/0/a/${ID}.jpg`)
    expect(savedCardImage(`https://cards.scryfall.io/small/back/0/a/${ID}.jpg`)).toBe(`card-image://scryfall/small/back/0/a/${ID}.jpg`)
  })

  it('leaves other images, and none, as they are', () => {
    for (const src of [`https://cards.scryfall.io/normal/front/0/a/${ID}.jpg`, `https://cards.scryfall.io/art_crop/front/0/a/${ID}.jpg`, 'data:image/png;base64,']) {
      expect(savedCardImage(src)).toBe(src)
    }
    expect(savedCardImage(null)).toBeNull()
    expect(savedCardImage(undefined)).toBeUndefined()
  })
})
