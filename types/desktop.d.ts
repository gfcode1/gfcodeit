export type GFMediaKey = 'playpause' | 'stop' | 'next' | 'previous'

declare global {
  interface Window {
    /** Injected by desktop/preload.cjs when running inside the Electron shell. */
    gfDesktop?: {
      platform: string
      onMediaKey(callback: (action: GFMediaKey) => void): () => void
    }
  }
}
