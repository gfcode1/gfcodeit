# AGENTS.md

Static, PWA-ready mini-app framework. A persistent shell (`index.html`) hosts apps
(`apps/<id>/`) in same-origin iframes and shares one runtime via `window.GF`.

## Requirements

Node 20+, pnpm 10+. No git repo is checked in here.

## Setup / generated files

`pnpm install` then `pnpm dev`. Fresh clones need a build first: `public/framework/`,
`public/openmoji/`, `public/icons/*.png` are **generated and gitignored** (as is `dist/`).
Never edit or commit the generated trees.

## Commands

```bash
pnpm dev             # predev: build icons+pwa-icons+framework, then vite on :5173/gfcodeit/
pnpm build           # prebuild: validate:apps → icons → pwa-icons → framework → vite build
pnpm preview         # serve dist/ on :4173/gfcodeit/
pnpm typecheck       # tsc --noEmit (covers src/, apps/, framework/, types/, vite configs)
pnpm validate:apps   # app.manifest.json schema check
pnpm new-app <id> [OpenMojiHexcode]   # scaffold from templates/app
pnpm dev:app <id>    # vite, opens apps/<id>/index.html standalone (no predev hook)
```

Verification (all need a running server; `playwright-core` ships no browser, so point
`CHROME` at a local Chrome/Chromium):

```bash
pnpm smoke      # default BASE_URL http://localhost:4173/gfcodeit/ (built dist + preview)
pnpm ui:audit   # default BASE_URL http://localhost:5173/gfcodeit/ (dev server)
pnpm pwa:audit  # production only — build + preview first
BASE_URL=... CHROME=/path/to/chrome pnpm smoke
```

`scripts/smoke.mjs` is the end-to-end acceptance gate — extend it whenever you add or
change an app.

## Two Vite builds (most important gotcha)

- Shell imports `src/**` directly.
- Apps load the **prebuilt** `public/framework/v1/gf-runtime.js` + `tokens.css`.
- `framework/index.ts` is the runtime entry (imports `src/ui/index.ts`, calls `initSDK`,
  sets `window.GF`/`window.GF_READY`); `vite.framework.config.ts` builds only it.

So edits under `src/core/**` or `src/ui/**` do not reach apps until `pnpm build:framework`
runs. `pnpm dev`/`pnpm build` do this via pre-hooks, but `pnpm dev:app` bypasses `predev` —
run `pnpm build:framework` manually first.

- `vite.config.ts` builds the site; `base` is hardcoded `/gfcodeit/`. Dev :5173,
  preview :4173. Routing is hash-based (no server rewrites).

## Apps

- Auto-discovered. `src/core/registry.ts` globs `apps/*/app.manifest.json`; Vite adds each
  `apps/*/index.html` as an `app-<id>` build entry. No registry file to edit.
- `manifest.id` **must equal the folder name** (enforced by `validate:apps`) and `entry`
  must exist. `icon` is an OpenMoji hexcode; `sdk` must be a semver range;
  `storage.scope` is `profile` (default) or `shared`.
- App bootstrap: `import(/* @vite-ignore */ \`${import.meta.env.BASE_URL}framework/v1/gf-runtime.js\`)`
  then await `window.GF_READY`. See `templates/app/src/main.ts`. `window.GF` is typed in
  `types/gf.d.ts`; import the `GFApi` type from `../../../src/core/sdk`.
- Standalone gotcha: `pnpm dev:app` (and opening `apps/<id>/index.html` directly) runs the
  app **outside the shell**, so `gf.embedded === false` and bridge behaviour degrades
  (`window.confirm`, local toast, no-op badge, in-memory scheduler). Exercise bridge and
  permission behaviour from inside the shell. At build, manifests are copied to
  `dist/apps/<id>/`.
- `permissions` are enforced in `src/core/sdk.ts` and re-checked by the shell for every
  bridged call; allowed values live in `scripts/validate-apps.mjs`. Without the declared
  permission, `ui.confirm`, `shell.*`, `scheduler.*`, `theme.set`, `profile.list/update`
  throw `PermissionDeniedError`, while `ui.toast`/`ui.modal` fall back locally and
  `ui.badge` is a silent no-op. `<gf-modal>` etc. are plain web components needing no
  permission — don't confuse them with the bridged `gf.ui.modal`.

## UI components

`src/ui/` holds the `<gf-*>` design system (Web Components, shadow DOM). Extend `GFElement`
from `src/ui/base.ts`, render via `styles()`/`template()`, register with `define('gf-x', ...)`,
style with the CSS vars in `src/ui/tokens.css`. New files must be imported in
`src/ui/index.ts` (imported only by `framework/index.ts`) or they won't register.

## Conventions

- No semicolons, single quotes, 2-space indent. `strict`, `noUnusedLocals`,
  `noUnusedParameters` are on.
- Comments only for non-obvious intent, matching existing style.
- Storage migrations: `gf.storage.onUpgrade(fn, scope?)`; versions tracked per scope.
