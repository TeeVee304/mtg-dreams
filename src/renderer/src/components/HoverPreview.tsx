import { useEffect, useSyncExternalStore, type MouseEvent } from 'react'
import { cheapestVersion, requestPrintings, usePrintingsVersion } from '../printings'
import { useSettings } from '../settings'

// A single floating card image that follows the cursor. Targets give either an
// image URL directly, or a card name whose cheapest printing is looked up.

interface Target {
  src?: string | null
  name?: string
}

interface PreviewState {
  target: Target | null
  x: number
  y: number
}

let state: PreviewState = { target: null, x: 0, y: 0 }
const listeners = new Set<() => void>()

function set(next: PreviewState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function hidePreview(): void {
  if (state.target) set({ ...state, target: null })
}

/** Spread onto any element: `<td {...previewHandlers({ src })}>`. */
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

const WIDTH = 300
const HEIGHT = Math.round((WIDTH * 680) / 488)
const GAP = 24

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
