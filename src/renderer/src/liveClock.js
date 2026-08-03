import { useSyncExternalStore } from 'react'

/**
 * One clock for everything that has to keep counting between source refreshes.
 *
 * The tracker source has a 30s TTL, which is right for noticing a *new* session but too
 * coarse for an elapsed counter, and refetching more often would hammer sqlite to redraw a
 * number the renderer can work out for itself. So the running session's end is recomputed
 * locally instead.
 *
 * It is a shared store rather than a `setInterval` per component because a running session
 * appears in three places at once — the grid bar, the sidebar line, the popover pill — and
 * three independent intervals would drift into showing three different minutes. One tick,
 * one value, one moment where they all move together.
 */
const TICK_MS = 30 * 1000

export function createLiveClock({
  intervalMs = TICK_MS,
  now = () => Date.now(),
  schedule = setInterval,
  cancel = clearInterval
} = {}) {
  const listeners = new Set()
  let value = now()
  let timer = null

  return {
    getSnapshot: () => value,

    // The timer only runs while something is watching: with the tracker source off there is
    // no live session on screen, and an idle window should not wake up twice a minute.
    subscribe(listener) {
      listeners.add(listener)
      if (timer === null) {
        timer = schedule(() => {
          value = now()
          for (const notify of [...listeners]) notify()
        }, intervalMs)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== null) {
          cancel(timer)
          timer = null
        }
      }
    }
  }
}

export const liveClock = createLiveClock()

/** The current time in ms, re-rendering the caller on every tick. */
export function useLiveClock() {
  return useSyncExternalStore(liveClock.subscribe, liveClock.getSnapshot, liveClock.getSnapshot)
}
