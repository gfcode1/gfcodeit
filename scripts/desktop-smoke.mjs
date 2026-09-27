import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

// Runs the built Electron app (desktop/main.mjs) against dist/ and re-checks the
// desktop-specific guarantees over CDP. Needs a display; on a headless box run it
// under xvfb-run, e.g. `xvfb-run -a pnpm desktop:smoke`.
//
// Build first: `pnpm desktop:build`.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CDP_PORT = process.env.GF_CDP_PORT ?? '9222'
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function waitForCdp(url, timeoutMs = 30_000) {
  return new Promise((resolvePromise, reject) => {
    const deadline = Date.now() + timeoutMs
    const attempt = async () => {
      try {
        const res = await fetch(`${url}/json/version`)
        if (res.ok) return resolvePromise()
        throw new Error(String(res.status))
      } catch (error) {
        if (Date.now() > deadline) reject(new Error(`CDP endpoint not ready at ${url}: ${error}`))
        else setTimeout(attempt, 250)
      }
    }
    attempt()
  })
}

const require = createRequire(import.meta.url)
const electron = require('electron')
const child = spawn(electron, ['desktop/main.mjs', `--remote-debugging-port=${CDP_PORT}`, '--no-sandbox'], {
  cwd: root,
  stdio: 'inherit',
})

let browser
try {
  await waitForCdp(CDP_URL)
  browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  const page = await context.waitForEvent('page', { timeout: 15_000 }).catch(() => context.pages()[0])
  await page.waitForLoadState('domcontentloaded')

  const origin = await page.evaluate(() => window.location.origin)
  check('served from the app:// origin', origin === 'app://gfcodeit', origin)

  const noServiceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return true
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.length === 0
  })
  check('no service worker in the desktop build', noServiceWorker)

  const desktopApi = await page.evaluate(() => typeof window.gfDesktop?.onMediaKey === 'function')
  check('preload exposes the media-key bridge', desktopApi)

  const colorIcon = await page.evaluate(async () => {
    const res = await fetch('/openmoji/color/svg/1F600.svg')
    return { ok: res.ok, type: res.headers.get('content-type') ?? '' }
  })
  check('color emoji is bundled locally', colorIcon.ok && /svg/.test(colorIcon.type), JSON.stringify(colorIcon))

  await page.waitForSelector('.app-card', { timeout: 15_000 })
  const cardCount = await page.locator('.app-card').count()
  check('launcher renders app cards', cardCount >= 1, `${cardCount} card(s)`)

  await page.evaluate(() => {
    window.location.hash = '#/app/clock'
  })
  const frame = page.frameLocator('iframe.app-frame')
  await frame.locator('body').waitFor({ timeout: 15_000 })
  const embedded = await frame.evaluate(() => window.GF?.embedded === true)
  check('app mounts and handshakes over the bridge', embedded)

  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('unexpected failure', false, String(error))
} finally {
  await browser?.close().catch(() => {})
  child.kill('SIGTERM')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
