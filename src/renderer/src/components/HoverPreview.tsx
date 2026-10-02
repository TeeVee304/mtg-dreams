import { useEffect, useSyncExternalStore, type MouseEvent } from 'react'
import { cheapestVersion, requestPrintings, usePrintingsVersion } from '../stores/printings'
import { useSettings } from '../stores/settings'

/** Preview source: image URL, or card name resolved to its cheapest printing. */
interface Target {
  src?: string | null
  name?: string
}

/** Preview store state; `x`/`y` are cursor client coordinates. */
interface PreviewState {
  target: Target | null
  x: number
  y: number
}

let state: PreviewState = { target: null, x: 0, y: 0 }
const listeners = new Set<() => void>()

/** Replaces the state and notifies subscribers. */
function set(next: PreviewState): void {
  state = next
  for (const listener of listeners) listener()
}

/** `useSyncExternalStore` subscribe. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Hides the preview. */
export function hidePreview(): void {
  if (state.target) set({ ...state, target: null })
}

/**
 * Mouse handlers showing a preview of `target`; spread onto an element: `<td {...previewHandlers({ src })}>`.
 * Name targets request printings at high priority.
 */
export function previewHandlers(target: Target) {
  return {
    onMouseEnter(event: MouseEvent) {
      if (!target.src && target.name) requestPrintings(target.name, { priority: 'high' })
      set({ target, x: event.clientX, y: event.clientY })
    },
    onMouseMove(event: MouseEvent) {
      set({ target, x: event.clientX, y: event.clientY })
    },
    onMouseLeave: hidePreview
  }
}

/** Preview width (px); height follows the card aspect ratio. */
const WIDTH = 300
/** Preview height (px) at the card aspect ratio (488×680). */
const HEIGHT = Math.round((WIDTH * 680) / 488)
/** Cursor offset (px). */
const GAP = 24

/** Single app-wide floating card preview following the cursor; hidden on mousedown. */
export function HoverPreview() {
  const { target, x, y } = useSyncExternalStore(subscribe, () => state)
  const { priceBasis } = useSettings()
  usePrintingsVersion()

  useEffect(() => {
    window.addEventListener('mousedown', hidePreview)
    window.addEventListener('blur', hidePreview)
    window.addEventListener('scroll', hidePreview, true)
    return () => {
      window.removeEventListener('mousedown', hidePreview)
      window.removeEventListener('blur', hidePreview)
      window.removeEventListener('scroll', hidePreview, true)
    }
  }, [])

  if (!target) return null
  let src = target.src ?? null
  if (!src && target.name) src = cheapestVersion(target.name, priceBasis)?.printing?.imageNormal ?? null
  if (!src) return null

  const left = x + GAP + WIDTH > window.innerWidth ? x - GAP - WIDTH : x + GAP
  const top = Math.min(Math.max(8, y - HEIGHT / 2), window.innerHeight - HEIGHT - 8)
  return (
    <div className="hover-preview" style={{ left, top, width: WIDTH, height: HEIGHT }}>
      <img src={src} alt="" />
    </div>
  )
}
