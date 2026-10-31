import { useSettings } from '../stores/settings'
import { savedCardImage } from '@shared/images'
import { ui } from '@shared/text'

/** Shimmering text placeholder. */
export function Skeleton({ width = 64 }: { width?: number }) {
  return (
    <span className="skeleton-wrap">
      <span className="skeleton" style={{ width }} aria-hidden="true" />
      <span className="sr-only">{ui.common.loading}</span>
    </span>
  )
}

/** A foil card's sheen, over its image: still, sweeping while the card (row, tile, preview) is hovered. */
export const FoilSheen = () => <span className="foil-sheen" aria-hidden="true" />

/**
 * Art thumbnail cropped from the small image; shimmer while loading, blank without an image, nothing
 * if card images are off. A foil copy has a sheen. Scryfall's small images come from the saved ones,
 * so they show offline.
 */
export function CardThumb({ src, loading, foil }: { src: string | null | undefined; loading?: boolean; foil?: boolean }) {
  const { cardImages } = useSettings()
  if (!cardImages) return null
  return (
    <span className={`thumb${!src && loading ? ' skeleton' : ''}`} aria-hidden="true">
      {src && <img src={savedCardImage(src)} alt="" loading="lazy" draggable={false} />}
      {src && foil && <FoilSheen />}
    </span>
  )
}
