import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env, VITE_GF_DESKTOP: '1' }

// Mirrors the `prebuild` hook, then runs Vite directly so the desktop base and
// the PWA toggle are applied (the package scripts default to the web build).
const prebuild = ['validate:apps', 'build:icons', 'build:pwa-icons', 'build:framework', 'build:rss-catalog']

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

export function build() {
  for (const script of prebuild) run('pnpm', [script])
  run('pnpm', ['exec', 'vite', 'build'])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build()
