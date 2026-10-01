// Small pieces for rows that are still loading, and the card thumbnail beside a name.

/** A shimmering bar where text will appear once it loads. */
export function Skeleton({ width = 64 }: { width?: number }) {
  return (
    <span className="skeleton-wrap">
      <span className="skeleton" style={{ width }} aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </span>
  )
}

/**
 * The card's art, cropped from its small image (already used for previews, so no
 * extra download beyond it). A shimmer while its versions load; blank without one.
 */
export function CardThumb({ src, loading }: { src: string | null | undefined; loading?: boolean }) {
  return (
    <span className={`thumb${!src && loading ? ' skeleton' : ''}`} aria-hidden="true">
      {src && <img src={src} alt="" loading="lazy" draggable={false} />}
    </span>
  )
}
