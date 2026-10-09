import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

/** What the menu's own items do; the editing items use Electron's built-in roles. */
export interface ContextMenuActions {
  /** Copies the image at a point of the page to the clipboard. */
  copyImageAt: (x: number, y: number) => void
  /** Downloads an image and puts it on the clipboard; `fallback` runs if that fails. */
  copyImageFrom: (url: string, fallback: () => void) => void
  /** Puts text on the clipboard. */
  copyText: (text: string) => void
}

/**
 * @returns The large version (672 × 936) of a Scryfall card image shown smaller, such as a table
 * thumbnail (small) or a card tile (normal); null for other images, art crops included.
 */
export function largeCardImage(src: string): string | null {
  const match = /^https:\/\/cards\.scryfall\.io\/(small|normal|large)\/(.+)$/.exec(src)
  return match ? `https://cards.scryfall.io/large/${match[2]}` : null
}

/** The parts of Electron's context-menu parameters the menu reads. */
type Params = Pick<ContextMenuParams, 'x' | 'y' | 'mediaType' | 'srcURL' | 'selectionText' | 'isEditable' | 'editFlags'>

/**
 * Right-click menu for what was clicked: an image (copy it, or its web address), selected text
 * (copy) or a text field (cut, copy, paste, select all). Electron shows no menu of its own.
 * @returns Menu items; empty when there is nothing to offer, so no menu shows.
 */
export function contextMenuItems(params: Params, actions: ContextMenuActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (params.mediaType === 'image' && params.srcURL) {
    // A card copies at full size, whatever size it is shown at; other images copy as shown.
    const large = largeCardImage(params.srcURL)
    const copyShown = () => actions.copyImageAt(params.x, params.y)
    items.push({ label: 'Copy image', click: large ? () => actions.copyImageFrom(large, copyShown) : copyShown })
    // Card images come from Scryfall; app icons are bundled, with no address worth sharing.
    if (/^https?:/i.test(params.srcURL)) {
      items.push({ label: 'Copy image address', click: () => actions.copyText(large ?? params.srcURL) })
    }
  }
  if (params.isEditable) {
    if (items.length > 0) items.push({ type: 'separator' })
    const { canCut, canCopy, canPaste, canSelectAll } = params.editFlags
    items.push(
      { role: 'cut', label: 'Cut', enabled: canCut },
      { role: 'copy', label: 'Copy', enabled: canCopy },
      { role: 'paste', label: 'Paste', enabled: canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Select all', enabled: canSelectAll }
    )
  } else if (params.selectionText.trim()) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push({ role: 'copy', label: 'Copy' })
  }
  return items
}
