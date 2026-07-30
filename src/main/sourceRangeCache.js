export const DEFAULT_MAX_ENTRIES = 24

/**
 * Caches fetched events per source *and* per requested range. Each calendar view
 * asks for a different window of time, so keying on the source alone would make
 * every view switch evict the previous view's entry and refetch everything.
 *
 * Entries are held in insertion order and the oldest is dropped once the cache
 * is full, which keeps a handful of recently visited ranges warm without growing
 * without bound as the user navigates.
 */
export function createSourceRangeCache({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
  const entries = new Map()
  const lastBySource = new Map()

  const key = (source, rangeStart, rangeEnd) => `${source}|${rangeStart}|${rangeEnd}`

  return {
    get(source, rangeStart, rangeEnd) {
      return entries.get(key(source, rangeStart, rangeEnd))
    },

    /** Most recent entry for a source in any range, used when a source fails. */
    lastFor(source) {
      return lastBySource.get(source)
    },

    remember(source, rangeStart, rangeEnd, entry) {
      const entryKey = key(source, rangeStart, rangeEnd)
      // Re-inserting moves the key to the end, so eviction always drops the
      // least recently written range.
      entries.delete(entryKey)
      entries.set(entryKey, entry)
      lastBySource.set(source, entry)

      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value)
      }

      return entry
    },

    invalidate(source) {
      for (const entryKey of entries.keys()) {
        if (entryKey.startsWith(`${source}|`)) entries.delete(entryKey)
      }
      lastBySource.delete(source)
    },

    get size() {
      return entries.size
    }
  }
}
