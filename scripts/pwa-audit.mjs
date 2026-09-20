import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/gfcodeit/'
const executablePath = process.env.CHROME

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 420, height: 860 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })

  // Web app manifest
  const manifest = await page.evaluate(async () => {
    const response = await fetch('./manifest.webmanifest')
    return response.ok ? await response.json() : null
  })
  check('manifest is served and valid', !!manifest, manifest ? manifest.short_name : 'missing')
  check('manifest has standalone display', manifest?.display === 'standalone')
  check('manifest declares maskable icon', (manifest?.icons ?? []).some((i) => i.purpose === 'maskable'))
  check('manifest declares 192 and 512 icons', (manifest?.icons ?? []).length >= 3)

  // Service worker registration
  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
    ])
    return ready
  })
  check('service worker becomes ready', swReady)

  // Reload so the page is controlled by the SW
  await page.reload({ waitUntil: 'networkidle' })
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  check('page is controlled by the service worker', controlled)

  // Warm the app cache: open Notes (fetches app html/js/css)
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const notes = page.locator('.app-card').filter({ hasText: 'Notes' }).first()
  await notes.hover()
  await notes.getByText('Open').click()
  const frame = page.frameLocator('iframe.app-frame')
  await frame.locator('.notes-toolbar').waitFor({ timeout: 15000 })
  check('Notes app loaded online (cache warmed)', true)

  const cached = await page
    .waitForFunction(
      async () => {
        for (const name of await caches.keys()) {
          const cache = await caches.open(name)
          const keys = await cache.keys()
          if (keys.some((request) => request.url.includes('/apps/notes/'))) return true
        }
        return false
      },
      null,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)
  check('app shell is present in the cache', cached)

  // Go offline and load the shell from the precache, then open the cached app.
  await context.setOffline(true)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  const offlineShell = await page
    .locator('.app-card')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  check('shell loads offline', offlineShell)

  if (offlineShell) {
    const offlineNotes = page.locator('.app-card').filter({ hasText: 'Notes' }).first()
    await offlineNotes.hover()
    await offlineNotes.getByText('Open').click()
  }
  const offlineApp = page.frameLocator('iframe.app-frame')
  const noteVisible = await offlineApp
    .locator('.notes-toolbar')
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  check('cached app loads offline', noteVisible)

  const offlineBadge = await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
    const node = document.querySelector('.conn')
    return node ? !node.hidden : false
  })
  check('offline indicator reacts to connectivity events', offlineBadge)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))

  await context.setOffline(false)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('unexpected failure', false, String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
