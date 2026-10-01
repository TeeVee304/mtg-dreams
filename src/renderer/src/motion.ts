/** Windows' "Animation effects" off: celebrations and count-ups are skipped. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
