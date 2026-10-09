/** A floppy wizard hat: brim, then the cone bending over to its tip. */
const HAT = 'M2.5 19.5c0-1.1 4.3-2 9.5-2s9.5.9 9.5 2-4.3 2-9.5 2-9.5-.9-9.5-2zM6.3 17.9 10.6 6C11.4 3.6 13.4 2 15.8 2.6c1.9.5 3 2.2 3.4 4.3l-2.6-1.1-1.4.5 2.1 11.6'
/** A star on the cone; only drawn from 24 px up, where it stays a star. */
const STAR = 'M12.2 10.6l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z'
/** Sparkles that twinkle around the hat on hover. */
const SPARKS = ['M21.5 1.6v3M20 3.1h3', 'M3.6 5.4v2.4M2.4 6.6h2.4']

/**
 * The Deck Wizard's icon, stroked in `currentColor` like the other icons. Its hover wobble and
 * sparkles come from CSS on a `.hat-host` ancestor, and stop when motion is reduced.
 */
export function WizardHat({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="wizard-hat"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="hat-body">
        <path d={HAT} />
        {size >= 24 && <path d={STAR} strokeWidth="1.2" />}
      </g>
      {SPARKS.map((d) => (
        <path key={d} className="hat-spark" d={d} strokeWidth="1.5" />
      ))}
    </svg>
  )
}
