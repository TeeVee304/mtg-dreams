/** Props of {@link HeroPortrait}. */
interface HeroPortraitProps {
  /** Art crops: the commander's, or two partners'. */
  arts: string[]
}

/**
 * A banner's commander art (list headers, the Deck Wizard): the whole art as a portrait at the
 * right, two partners' side by side, over the first art blurred to fill the banner with its colors.
 * The banner is an `art-hero`, which shades it toward its text.
 */
export function HeroPortrait({ arts }: HeroPortraitProps) {
  if (arts.length === 0) return null
  return (
    <>
      <div className="hero-backdrop" aria-hidden="true">
        <img src={arts[0]} alt="" draggable={false} />
      </div>
      <div className={`hero-portrait${arts.length > 1 ? ' pair' : ''}`} aria-hidden="true">
        {arts.map((art) => (
          <img key={art} src={art} alt="" draggable={false} />
        ))}
      </div>
    </>
  )
}
