import { useSettings } from '../settings'

/** Shimmering text placeholder. */
export function Skeleton({ width = 64 }: { width?: number }) {
  return (
    <span className="skeleton-wrap">
      <span className="skeleton" style={{ width }} aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </span>
  )
}

/** Art thumbnail cropped from the small image; shimmer while loading, blank without an image, nothing if card images are off. */
export function CardThumb({ src, loading }: { src: string | null | undefined; loading?: boolean }) {
  const { cardImages } = useSettings()
  if (!cardImages) return null
  return (
    <span className={`thumb${!src && loading ? ' skeleton' : ''}`} aria-hidden="true">
      {src && <img src={src} alt="" loading="lazy" draggable={false} />}
    </span>
  )
}
