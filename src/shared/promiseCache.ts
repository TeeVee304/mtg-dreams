/**
 * A cache of results made by async work: callers asking for the same key share one result, made
 * or being made, and the least recently used are dropped past a size. Failures aren't kept, so
 * asking again tries again.
 *
 * @packageDocumentation
 */

/** Cached async results by key. */
export interface PromiseCache<T> {
  /** @returns The result for `key`, making it with `make` unless one is made or being made. */
  get(key: string, make: () => Promise<T>): Promise<T>
  /** Results kept or being made. */
  readonly size: number
}

/** @param keep - Most results kept. */
export function promiseCache<T>(keep: number): PromiseCache<T> {
  const entries = new Map<string, Promise<T>>()
  return {
    get(key, make) {
      let entry = entries.get(key)
      if (entry) entries.delete(key)
      else {
        entry = make()
        const made = entry
        made.catch(() => entries.get(key) === made && entries.delete(key))
      }
      entries.set(key, entry)
      while (entries.size > keep) entries.delete(entries.keys().next().value!)
      return entry
    },
    get size() {
      return entries.size
    }
  }
}
