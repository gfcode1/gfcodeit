import { registerSW } from 'virtual:pwa-register'

export interface PWAOptions {
  /** Return true to apply the update immediately. */
  onUpdateAvailable: () => Promise<boolean>
  onOfflineReady: () => void
}

export function setupPWA(options: PWAOptions): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void options.onUpdateAvailable().then((accepted) => {
        if (accepted) void updateSW(true)
      })
    },
    onOfflineReady() {
      options.onOfflineReady()
    },
  })
}
