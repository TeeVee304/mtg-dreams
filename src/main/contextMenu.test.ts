import { describe, expect, it, vi } from 'vitest'
import { contextMenuItems, largeCardImage } from './contextMenu'

const EDIT_FLAGS = { canUndo: false, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: false }

/** Context-menu parameters: a right click on nothing in particular, plus `extra`. */
const params = (extra: object = {}) => ({
  x: 10,
  y: 20,
  mediaType: 'none' as const,
  srcURL: '',
  selectionText: '',
  isEditable: false,
  editFlags: EDIT_FLAGS,
  ...extra
})

const labels = (items: ReturnType<typeof contextMenuItems>) => items.map((item) => item.label ?? item.type)

describe('contextMenuItems', () => {
  it('offers nothing on plain page background', () => {
    expect(contextMenuItems(params(), { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() })).toEqual([])
  })

  it('copies a card at full size, falling back to the image as shown', () => {
    const actions = { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() }
    const items = contextMenuItems(params({ mediaType: 'image', srcURL: 'https://cards.scryfall.io/small/front/a/b/ab.jpg' }), actions)
    expect(labels(items)).toEqual(['Copy image', 'Copy image address'])
    items[0].click!({} as never, undefined, {} as never)
    expect(actions.copyImageFrom).toHaveBeenCalledWith('https://cards.scryfall.io/large/front/a/b/ab.jpg', expect.any(Function))
    actions.copyImageFrom.mock.calls[0][1]()
    expect(actions.copyImageAt).toHaveBeenCalledWith(10, 20)
    items[1].click!({} as never, undefined, {} as never)
    expect(actions.copyText).toHaveBeenCalledWith('https://cards.scryfall.io/large/front/a/b/ab.jpg')
  })

  it('copies other images as shown', () => {
    const actions = { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() }
    const crop = 'https://cards.scryfall.io/art_crop/front/a/b/ab.jpg'
    contextMenuItems(params({ mediaType: 'image', srcURL: crop }), actions)[0].click!({} as never, undefined, {} as never)
    expect(actions.copyImageAt).toHaveBeenCalledWith(10, 20)
    expect(actions.copyImageFrom).not.toHaveBeenCalled()
  })

  it('knows which images are Scryfall cards', () => {
    expect(largeCardImage('https://cards.scryfall.io/normal/back/c/d/cd.jpg')).toBe('https://cards.scryfall.io/large/back/c/d/cd.jpg')
    expect(largeCardImage('https://cards.scryfall.io/art_crop/front/c/d/cd.jpg')).toBeNull()
    expect(largeCardImage('file:///app/mana/W.svg')).toBeNull()
  })

  it('has no address to copy for bundled images', () => {
    const items = contextMenuItems(params({ mediaType: 'image', srcURL: 'file:///app/mana/W.svg' }), { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() })
    expect(labels(items)).toEqual(['Copy image'])
  })

  it('copies selected text', () => {
    const items = contextMenuItems(params({ selectionText: 'Sol Ring' }), { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() })
    expect(items).toEqual([{ role: 'copy', label: 'Copy' }])
  })

  it('edits text fields, within what the field allows', () => {
    const editFlags = { ...EDIT_FLAGS, canCut: false, canCopy: false }
    const items = contextMenuItems(params({ isEditable: true, editFlags }), { copyImageAt: vi.fn(), copyImageFrom: vi.fn(), copyText: vi.fn() })
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste', 'separator', 'Select all'])
    expect(items.map((item) => item.enabled)).toEqual([false, false, true, undefined, true])
  })
})
