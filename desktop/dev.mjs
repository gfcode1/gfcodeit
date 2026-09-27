import { spawn, spawnSync } from 'node:child_process'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env, VITE_GF_DESKTOP: '1' }
const DEV_URL = 'http://localhost:5173/'

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      get(url, (res) => {
        res.resume()
        resolvePromise()
      }).on('error', () => {
        if (Date.now() > deadline) reject(new Error(`Dev server did not start at ${url}`))
        else setTimeout(attempt, 200)
      })
    }
    attempt()
  })
}

// Same prebuild as the desktop build, but the vite dev server drives the app.
for (const script of ['validate:apps', 'build:icons', 'build:pwa-icons', 'build:framework', 'build:rss-catalog']) {
  run('pnpm', [script])
}

const vite = spawn('pnpm', ['exec', 'vite'], { cwd: root, stdio: 'inherit', env })

function shutdown(code = 0) {
  if (!vite.killed) vite.kill('SIGTERM')
  process.exit(code)
}

try {
  await waitForServer(DEV_URL)
} catch (error) {
  console.error(`[desktop] ${error.message}`)
  shutdown(1)
}

const require = createRequire(import.meta.url)
const electron = require('electron')
const electronProcess = spawn(electron, ['desktop/main.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...env, GF_DESKTOP_URL: DEV_URL },
})

electronProcess.on('exit', (code) => shutdown(code ?? 0))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
