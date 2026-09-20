import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve, join } from 'node:path'
import { readdirSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'

const root = __dirname
const appsDir = resolve(root, 'apps')

function discoverApps(): string[] {
  if (!existsSync(appsDir)) return []
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
}

function discoverAppEntries(): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const name of discoverApps()) {
    const entry = resolve(appsDir, name, 'index.html')
    if (existsSync(entry)) entries[`app-${name}`] = entry
  }
  return entries
}

/** Copies each app's manifest into dist so the runtime can fetch it at run time. */
function copyAppManifests(): Plugin {
  return {
    name: 'gf:copy-app-manifests',
    apply: 'build',
    closeBundle() {
      for (const name of discoverApps()) {
        const from = join(appsDir, name, 'app.manifest.json')
        if (!existsSync(from)) continue
        const target = join(root, 'dist', 'apps', name)
        mkdirSync(target, { recursive: true })
        copyFileSync(from, join(target, 'app.manifest.json'))
      }
    },
  }
}

const BASE = '/gfcodeit/'

export default defineConfig({
  base: BASE,
  plugins: [
    copyAppManifests(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'GFCode',
        short_name: 'GFCode',
        description: 'A collection of mini apps in one static framework.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f4f4ef',
        theme_color: '#f4f4ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        // Precache the shell + framework; apps (HTML and their assets) and
        // OpenMoji are cached on demand at first use.
        globIgnores: ['apps/**', 'assets/app-*', 'openmoji/**'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/\/apps\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/gfcodeit\/assets\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gf-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/gfcodeit\/apps\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gf-apps',
              // App URLs carry a per-open ?gf-token= query; ignore it so the
              // cached app shell is reused offline.
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/gfcodeit\/openmoji\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gf-openmoji',
              expiration: { maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        ...discoverAppEntries(),
      },
    },
  },
  server: {
    port: 5173,
  },
})
