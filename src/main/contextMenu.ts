import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'
import { ui } from '@shared/text'

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
 * thumbnail (small, also when saved: `card-image:`) or a card tile (normal); null for other images,
 * art crops included.
 */
export function largeCardImage(src: string): string | null {
  const match = /^(?:https:\/\/cards\.scryfall\.io|card-image:\/\/scryfall)\/(small|normal|large)\/(.+)$/.exec(src)
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
  const labels = ui.contextMenu
  if (params.mediaType === 'image' && params.srcURL) {
    // A card copies at full size, whatever size it is shown at; other images copy as shown.
    const large = largeCardImage(params.srcURL)
    const copyShown = () => actions.copyImageAt(params.x, params.y)
    items.push({ label: labels.copyImage, click: large ? () => actions.copyImageFrom(large, copyShown) : copyShown })
    // Card images come from Scryfall; app icons are bundled, with no address worth sharing.
    if (large || /^https?:/i.test(params.srcURL)) {
      items.push({ label: labels.copyImageAddress, click: () => actions.copyText(large ?? params.srcURL) })
    }
  }
  if (params.isEditable) {
    if (items.length > 0) items.push({ type: 'separator' })
    const { canCut, canCopy, canPaste, canSelectAll } = params.editFlags
    items.push(
      { role: 'cut', label: labels.cut, enabled: canCut },
      { role: 'copy', label: labels.copy, enabled: canCopy },
      { role: 'paste', label: labels.paste, enabled: canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: labels.selectAll, enabled: canSelectAll }
    )
  } else if (params.selectionText.trim()) {
    if (items.length > 0) items.push({ type: 'separator' })
    items.push({ role: 'copy', label: labels.copy })
  }
  return items
}
