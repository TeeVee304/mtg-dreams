/**
 * Memoizes `fn` on its latest arguments, compared by identity, so components computing the same
 * value from the same state (the sidebar and the open page) share one result.
 */
export function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let lastArgs: A | null = null
  let lastResult!: R
  return (...args: A) => {
    if (lastArgs === null || args.length !== lastArgs.length || args.some((arg, i) => arg !== lastArgs![i])) {
      lastResult = fn(...args)
      lastArgs = args
    }
    return lastResult
  }
}
