/** Props of {@link HeroArt}. */
interface HeroArtProps {
  /** Art crops: the commander's, or two partners'. */
  arts: string[]
  /** Class placing the art behind its banner. */
  className: string
}

/** A banner's commander art: one crop, or two partners' side by side, fading into each other. */
export function HeroArt({ arts, className }: HeroArtProps) {
  if (arts.length === 0) return null
  if (arts.length === 1) return <img className={className} src={arts[0]} alt="" draggable={false} />
  return (
    <div className={`${className} hero-pair`}>
      <img src={arts[0]} alt="" draggable={false} />
      <img src={arts[1]} alt="" draggable={false} />
    </div>
  )
}
