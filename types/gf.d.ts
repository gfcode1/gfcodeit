import type { GFApi } from '../src/core/sdk'

declare global {
  interface Window {
    /** Shared framework SDK, available once the runtime has loaded. */
    GF: GFApi
    /** Resolves with the SDK instance when the runtime is ready. */
    GF_READY: Promise<GFApi>
  }
}

export {}
