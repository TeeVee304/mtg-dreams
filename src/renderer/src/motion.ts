/** @returns Whether reduced motion is requested (Windows "Animation effects" off); animations are skipped. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
