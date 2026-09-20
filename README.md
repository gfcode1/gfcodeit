# GFCode

A static, PWA-ready framework that hosts a **collection of mini apps**. The shell
(`index.html`) is a persistent launcher; every app lives in its own subfolder,
runs inside an `iframe`, and shares a common UI, profile and storage layer
through an SDK bridge.

- **Shell + launcher**: app grid, favorites, recent, search, command palette (⌘K).
- **Shared framework runtime**: one build loaded by every app — Web Components,
  design tokens, and the `window.GF` SDK.
- **Profiles**: each profile has its own app data, theme and accent.
- **Storage**: namespaced, per-app, per-profile IndexedDB with schema migrations.
- **Bridge**: typed RPC + events between shell and apps over a `MessageChannel`.
- **Icons**: OpenMoji (black + color) as app and UI icons.

## Requirements

- Node 20+
- pnpm 10+

## Quick start

```bash
pnpm install
pnpm dev            # launches the shell + all apps (http://localhost:5173/gfcodeit/)
```

Production build and preview:

```bash
pnpm build          # validate manifests → build icons → build framework → build site
pnpm preview        # serve dist/ at http://localhost:4173/gfcodeit/
```

Quality checks:

```bash
pnpm typecheck      # tsc --noEmit
pnpm validate:apps  # manifest schema validation
pnpm smoke          # end-to-end smoke test (needs a running server)
```

## Project structure

```
index.html                 # shell entry (launcher)
apps/<id>/                 # one folder = one app (convention)
  app.manifest.json        # metadata (auto-discovered)
  index.html               # app entry (works standalone too)
  src/main.ts              # app code
src/
  shell/                   # launcher, app-host, views, command palette
  ui/                      # design system <gf-*> components + tokens.css
  core/                    # idb, storage, profile, bridge, sdk, registry, ...
framework/index.ts         # shared runtime entry (builds to public/framework/v1)
types/gf.d.ts              # global types for app authors
scripts/                   # build, validation, scaffolding, smoke test
templates/app/             # scaffold used by `pnpm new-app`
public/                    # generated: framework/, openmoji/ (gitignored)
```

## Adding an app

```bash
pnpm new-app weather 1F324   # id + OpenMoji hexcode
pnpm dev:app weather         # run the shell focused on the new app
```

The scaffolder copies `templates/app` to `apps/<id>`, fills in the manifest and
entry points. Apps are auto-discovered by `import.meta.glob`, so no registry to
edit.

Bundled example apps:

- **Notes** — CRUD notes stored per profile, uses the bridge for toast/confirm
  and app badges.
- **Weather** — live current conditions, hourly strip and 7-day forecast from
  [Open-Meteo](https://open-meteo.com/) (no API key), with geocoding search,
  geolocation, °C/°F units and an alert badge.
- **Todo** — tasks organized in lists with tags, priorities and due dates;
  filters (all/active/completed), search, manual and drag reordering, a
  completion progress bar, an active-count badge and per-task reminders wired to
  the shell scheduler (see [Timers, alarms & reminders](#timers-alarms--reminders)).
- **Calendar** — month view and per-event reminders wired to the shell
  scheduler (see [Timers, alarms & reminders](#timers-alarms--reminders)).
- **Clock** — clock, countdown timer, alarms and stopwatch. The timer and
  alarms use the shell scheduler, so they keep running and ring while the app
  is closed; the stopwatch resumes across reloads.
- **Radio** — search and stream thousands of internet stations from
  [Radio Browser](https://www.radio-browser.info/) by name, tag and country,
  with a top-charts view, favorites, recent history, a full player (media
  session, sleep timer), click tracking and station voting. HLS-only and
  insecure (HTTP) streams are filtered out for reliable playback.

### The manifest

```json
{
  "id": "notes",
  "name": "Notes",
  "description": "Quick notes, saved per profile.",
  "icon": "1F4DD",                 // OpenMoji hexcode
  "color": "#ff4d00",
  "category": "productivity",
  "version": "1.0.0",
  "sdk": "^1.0.0",                 // required framework range
  "entry": "index.html",
  "permissions": ["storage", "profile", "ui.toast", "ui.confirm"],
  "storage": { "scope": "profile", "schemaVersion": 1 }
}
```

`storage.scope` is `"profile"` (default, data isolated per profile) or
`"shared"` (common to all profiles).

### Using the SDK

Apps load the shared runtime once, then use `window.GF`:

```ts
const base = import.meta.env.BASE_URL
await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
const gf = await window.GF_READY

const profile = await gf.profile.getCurrent()
const notes = (await gf.storage.get<Note[]>('notes')) ?? []
await gf.storage.set('notes', notes)
gf.ui.toast('Saved', { variant: 'ok' })

gf.on('themeChanged', (theme) => console.log('theme', theme))
```

`GF` surface: `version`, `appId`, `manifest`, `permissions`, `profile`,
`storage` (`get/set/delete/keys/clear/onUpgrade/scope`), `cache`, `theme`, `ui`
(`toast/modal/confirm/badge`), `icons`, `shell` (`navigate/home`), `scheduler`,
`bus`, `on`.

Apps also load `tokens.css` and the `<gf-*>` web components from the runtime, so
they look consistent with the shell while remaining standalone-capable.

### Caching external data

Apps that talk to third-party APIs (Open-Meteo, SomaFM, …) should go through
`gf.cache` instead of `fetch` directly. Entries live in IndexedDB under the
`shared` scope (one copy across profiles), are pruned automatically on open, and
are excluded from backups.

```ts
// Fresh for 15 min, then served stale for up to 24 h while revalidating.
const forecast = await gf.cache.fetchJson<Forecast>('forecast:rome', url, {
  ttlMs: 15 * 60_000,
  staleTtlMs: 24 * 60 * 60_000,
})

await gf.cache.set('greeting', 'hello')      // explicit write
await gf.cache.remove('greeting')
await gf.cache.clear()                        // drop this app's cache
```

`fetchJson`/`fetchText` use stale-while-revalidate: a fresh hit returns
immediately, a stale hit returns instantly and refreshes in the background, and
a request that fails while a usable entry exists falls back to it (offline).
Pass `persist: false` for fast-changing data (kept in memory only) and
`signal` to make the call abortable. HTTP failures throw an error carrying a
numeric `status`. The cache degrades to memory-only without the `storage`
permission.

### Timers, alarms & reminders

Apps schedule one-off or repeating entries through the shell, which owns the
canonical state (IndexedDB) and keeps firing them even after the app iframe is
unmounted in the background. Declare the `scheduler` permission in the manifest.

```ts
const alarm = await gf.scheduler.schedule({
  kind: 'alarm',            // 'timer' | 'alarm' | 'reminder' | 'notification'
  title: 'Wake up',
  body: 'Morning!',
  delayMs: 30 * 60_000,     // or `fireAt: Date.now() + ms`
  repeat: { mode: 'weekdays' },
  sound: true,
  deepLink: '#/app/calendar',
})

await gf.scheduler.cancel(alarm.id)
await gf.scheduler.snooze(alarm.id, 5 * 60_000)
const pending = await gf.scheduler.list()
gf.scheduler.onFired((item) => console.log('fired', item))
```

The shell shows a toast for `notification` and a full-screen `<gf-alarm>` for
`alarm`/`timer`/`reminder`, sets the app badge, and can raise a system
notification (enable it in **Settings → Notifications**). Entries fire while
GFCode is open in any tab; a catch-up pass runs when the tab wakes. Without a
push server nothing fires while the browser is fully closed, and alarm sound
starts after the first user interaction (autoplay policy). The Activity center
(`#/activity`, bell in the top bar) lists and manages everything. Apps opened
standalone use an in-memory best-effort scheduler.

## Architecture

```
┌──────────────────────── shell (index.html) ────────────────────────┐
│  topbar · launcher · command palette · profiles · toast layer     │
│                                                                    │
│  <iframe src="apps/<id>/index.html?gf-token=…">                    │
│     │  gf:hello →  gf:welcome + MessagePort                        │
│     └──────────────── BridgeHost ⟷ BridgeClient ────────────────►  │
└────────────────────────────────────────────────────────────────────┘
        │ same origin                    ▲ shared
        ▼                                │
   IndexedDB `gfcode`              framework/v1/gf-runtime.js
   (profiles, app_<id>, meta)      tokens.css · OpenMoji
```

- **Isolation**: each app is a real page in an `iframe` (same origin, no
  `sandbox` attribute so IndexedDB is shared).
- **Profiles**: switching is only allowed from the home shell; apps receive
  `profileChanged` and reload their (profile-scoped) data.
- **Multi-tab**: each tab keeps its own shell state and reads the latest
  profile/theme from storage on load (no live cross-tab sync yet).
- **Permissions**: declared in the manifest, enforced by the SDK and re-checked
  by the shell for every bridged call.
- **Migrations**: lazy, on app open; per-scope schema versions tracked in `meta`.

## Icons

All icons are [OpenMoji](https://openmoji.org/) (CC BY-SA 4.0), copied at build
time to `public/openmoji/` (black + color SVG sets, plus `icons.json` and the
license). The `<gf-icon>` component renders the black set through a CSS mask so
icons inherit `currentColor`; `<gf-emoji-picker>` browses the color set.

## Deploy

The site is built for a subpath (default `/gfcodeit/`, see `base` in
`vite.config.ts`). Routing is hash-based, so any static host works without
server rewrites. Output goes to `dist/`.

## Offline & install (PWA)

The production build ships a service worker (`vite-plugin-pwa` / Workbox):

- **Precached**: shell (`index.html`), framework runtime + tokens, icons, manifest.
- **On-demand** (`CacheFirst`): app shells and assets under `/apps/` and
  `/assets/` (cached at first open — `ignoreSearch` handles the per-open bridge
  token), and the full OpenMoji set under `/openmoji/`.
- Hash routing means the shell is the single navigation fallback, so every route
  works offline once the shell is cached.
- Update flow: a prompt appears when a new version is available; an **Offline**
  indicator shows in the top bar when connectivity drops.

PWA icon PNGs are generated from the brutalist logo by `pnpm build:pwa-icons`
(SVG → PNG via sharp) into `public/icons/`.

## Status

- **M1 — done**: framework runtime, design system, core (storage/profiles),
  bridge, launcher, command palette, Notes demo, scaffolding, validation, smoke
  test.
- **M2 — done**: extra components (`gf-select`, `gf-radio-group`, `gf-slider`,
  `gf-progress`, `gf-accordion`, `gf-calendar`, `gf-date-picker`), data
  export/import (full / per profile / per app) with a downloadable versioned
  backup, backup offered when deleting a profile, app badges
  (`GF.ui.badge`, permission `notifications`), and lifecycle/memory tuning
  (configurable timeouts, unmount under memory pressure).
- **M3 — done**: full PWA — service worker with precache + runtime caching,
  generated icons (192/512/maskable/apple), installable manifest, offline shell
  and apps, update prompt and offline indicator.

## Verification

`pnpm smoke` runs a headless end-to-end check (launcher, discovery, favorites,
bridge mount, note CRUD, badge, persistence across reload, theme propagation
into the open app, export download, profile export, command palette, live
Weather forecast, zero console errors). `pnpm ui:audit` renders every component
and checks design tokens, shadow-DOM overflow, page overflow, dark mode and
accent application. `pnpm pwa:audit` checks the manifest, service worker
registration, the shell and a cached app loading offline, and the offline
indicator.

Point them at the dev server with:

```bash
BASE_URL=http://localhost:5173/gfcodeit/ pnpm smoke
BASE_URL=http://localhost:5173/gfcodeit/ pnpm ui:audit
```

The PWA checks require the production service worker, so run them against a
preview build:

```bash
pnpm build && pnpm preview           # serves dist/ on :4173
BASE_URL=http://localhost:4173/gfcodeit/ pnpm pwa:audit
```
