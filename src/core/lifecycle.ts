/** How long a backgrounded app stays mounted before being unmounted. */
export const BACKGROUND_TIMEOUT_MS = 10 * 60 * 1000

/** How long the shell waits for an app to complete the bridge handshake. */
export const HANDSHAKE_TIMEOUT_MS = 8_000

/** Heap usage ratio above which a hidden app is unmounted immediately. */
export const MEMORY_PRESSURE_THRESHOLD = 0.85

/** True when the browser reports high JS heap usage (Chromium only). */
export function memoryPressure(): boolean {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
  }).memory
  if (!memory || !memory.jsHeapSizeLimit) return false
  return memory.usedJSHeapSize / memory.jsHeapSizeLimit > MEMORY_PRESSURE_THRESHOLD
}

export const APP_ROUTE_PREFIX = '#/app/'
export const SETTINGS_ROUTE = '#/settings'
export const PROFILES_ROUTE = '#/profiles'
export const ACTIVITY_ROUTE = '#/activity'
export const HOME_ROUTE = '#/'
