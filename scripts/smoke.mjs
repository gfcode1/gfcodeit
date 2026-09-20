import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/gfcodeit/'
const executablePath = process.env.CHROME

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 420, height: 860 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const cardCount = await page.locator('.app-card').count()
  check('launcher renders app cards', cardCount >= 1, `${cardCount} card(s)`)

  const missing = await page.evaluate(() =>
    [
      'gf-select',
      'gf-radio-group',
      'gf-slider',
      'gf-progress',
      'gf-accordion',
      'gf-accordion-item',
      'gf-calendar',
      'gf-date-picker',
      'gf-emoji-picker',
      'gf-alarm',
    ].filter((name) => !customElements.get(name)),
  )
  check('M2 components registered', missing.length === 0, missing.join(', '))

  const notesCard = page.locator('.app-card').filter({ hasText: 'Notes' }).first()
  check('Notes app discovered', (await notesCard.count()) > 0)

  // Favorites via star
  await notesCard.hover()
  await notesCard.locator('.app-card__fav').click()
  await page.waitForTimeout(300)
  const favSection = await page.locator('.launcher__section', { hasText: 'Favorites' }).count()
  check('favorite section appears', favSection > 0)

  // Open the app
  await notesCard.hover()
  await notesCard.getByText('Open').click()
  const frame = page.frameLocator('iframe.app-frame')
  await frame.locator('.notes-toolbar').waitFor({ timeout: 15000 })
  check('Notes app mounted in iframe via bridge', true)

  // Create a note
  await frame.getByText('New note').click()
  await frame.locator('gf-modal[open]').waitFor()
  const modalInputs = frame.locator('gf-modal[open] gf-input input')
  await modalInputs.first().fill('Smoke test note')
  await frame.locator('gf-modal[open] gf-textarea textarea').fill('created by e2e smoke test')
  await frame.locator('gf-modal[open] gf-button').filter({ hasText: 'Save' }).click()
  await frame.locator('.note__title', { hasText: 'Smoke test note' }).waitFor({ timeout: 5000 })
  check('note created and rendered', true)

  // Badge reflects the app-reported count once back on the launcher
  await page.locator('#topbar').getByLabel('Back').click()
  await page.waitForSelector('.app-card', { timeout: 10000 })
  const badge = page.locator('.app-card').filter({ hasText: 'Notes' }).first().locator('.app-card__badge')
  const badgeText = (await badge.textContent())?.trim()
  check('app badge shows reported count', badgeText === '1', `badge="${badgeText}"`)

  // Persistence after reload (the hash keeps the app route open).
  await page.reload({ waitUntil: 'networkidle' })
  const frame2 = page.frameLocator('iframe.app-frame')
  if (await page.locator('iframe.app-frame').count()) {
    await frame2.locator('.notes-toolbar').first().waitFor({ timeout: 15000 })
  } else {
    await page.waitForSelector('.app-card', { timeout: 15000 })
    const card = page.locator('.app-card').filter({ hasText: 'Notes' }).first()
    await card.hover()
    await card.getByText('Open').click()
  }
  await frame2.locator('.note__title', { hasText: 'Smoke test note' }).waitFor({ timeout: 15000 })
  check('note persisted across reload', true)

  // Theme changes propagate into the open app
  const themeBefore = await frame2.locator('html').getAttribute('data-theme')
  await page.locator('#topbar').getByLabel('Command palette').click()
  await page.locator('.palette gf-input input').fill('Toggle light')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const themeAfter = await frame2.locator('html').getAttribute('data-theme')
  check('theme propagates into the open app', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`)

  // Settings: data export produces a downloadable backup
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  await page.locator('#nav').getByText('Settings').click()
  await page.locator('.view').waitFor({ timeout: 10000 })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    page.getByText('Export all data').click(),
  ])
  check('export all data downloads a backup', !!download, download ? download.suggestedFilename() : 'no download')

  // Profiles: export button present
  await page.locator('#nav').getByText('Profiles').click()
  await page.locator('.profile-list').waitFor({ timeout: 10000 })
  const exportButtons = await page.locator('.profile-row__actions').getByText('Export').count()
  check('profile export available', exportButtons >= 1)

  // Command palette
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  await page.locator('#topbar').getByLabel('Command palette').click()
  await page.locator('.palette').waitFor()
  check('command palette opens', true)
  await page.keyboard.press('Escape')

  // Weather app: geocoding search + live forecast from Open-Meteo
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const weatherCard = page.locator('.app-card').filter({ hasText: 'Weather' }).first()
  check('Weather app discovered', (await weatherCard.count()) > 0)
  await weatherCard.hover()
  await weatherCard.getByText('Open').click()
  const wf = page.frameLocator('iframe.app-frame')
  await wf.locator('.weather-toolbar').waitFor({ timeout: 15000 })
  await wf.locator('gf-input input').fill('Rome')
  await wf.getByText('Search', { exact: true }).click()
  await wf.locator('.result').first().waitFor({ timeout: 15000 })
  await wf.locator('.result').first().click()
  await wf.locator('.current__temp').waitFor({ timeout: 20000 })
  const tempText = (await wf.locator('.current__temp').textContent())?.trim()
  const days = await wf.locator('.day').count()
  check('weather forecast renders', /-?\d+°[CF]/.test(tempText ?? ''), tempText ?? '')
  check('weather shows a 7-day forecast', days === 7, `${days} days`)

  // Todo app: CRUD, completion, filters and the active-count badge
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const todoCard = page.locator('.app-card').filter({ hasText: 'Todo' }).first()
  check('Todo app discovered', (await todoCard.count()) > 0)
  await todoCard.hover()
  await todoCard.getByText('Open').click()
  const td = page.frameLocator('iframe.app-frame')
  await td.locator('.todo-toolbar').waitFor({ timeout: 15000 })

  for (const title of ['Smoke todo A', 'Smoke todo B']) {
    await td.locator('gf-page-header gf-button', { hasText: 'New task' }).click()
    await td.locator('gf-modal[open]').waitFor()
    await td.locator('gf-modal[open] .task-form gf-input input').first().fill(title)
    await td.locator('gf-modal[open] gf-button', { hasText: 'Save' }).click()
    await td.locator('.task__title', { hasText: title }).waitFor({ timeout: 5000 })
  }
  check('todo tasks created and rendered', (await td.locator('.task').count()) === 2)

  const taskA = td.locator('.task').filter({ hasText: 'Smoke todo A' })
  await taskA.locator('gf-checkbox').click()
  await page.waitForTimeout(200)
  check('todo task marked done', (await td.locator('.task.is-done').count()) === 1)

  await td.locator('.todo-filters gf-chip', { hasText: 'Active' }).click()
  await page.waitForTimeout(200)
  check('todo active filter hides completed', (await td.locator('.task', { hasText: 'Smoke todo A' }).count()) === 0)
  await td.locator('.todo-filters gf-chip', { hasText: 'All' }).click()
  await page.waitForTimeout(200)

  await page.locator('#topbar').getByLabel('Back').click()
  await page.waitForSelector('.app-card', { timeout: 10000 })
  const todoBadge = (await todoCard.locator('.app-card__badge').textContent())?.trim()
  check('todo badge shows active count', todoBadge === '1', `badge="${todoBadge}"`)

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  await todoCard.hover()
  await todoCard.getByText('Open').click()
  const td2 = page.frameLocator('iframe.app-frame')
  await td2.locator('.task', { hasText: 'Smoke todo A' }).waitFor({ timeout: 15000 })
  check('todo tasks persisted across reload', (await td2.locator('.task').count()) === 2)

  // Clock app: tabs, live clock, timer, alarm wired to the scheduler
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const clockCard = page.locator('.app-card').filter({ hasText: 'Clock' }).first()
  check('Clock app discovered', (await clockCard.count()) > 0)
  await clockCard.hover()
  await clockCard.getByText('Open').click()
  const ck = page.frameLocator('iframe.app-frame')
  await ck.locator('.tabs').waitFor({ timeout: 15000 })
  check('Clock shows four sections', (await ck.locator('.tabs__item').count()) === 4)
  check('clock renders a live time', /\d{1,2}:\d{2}/.test((await ck.locator('.clock__time').textContent()) ?? ''))

  await ck.locator('.tabs__item', { hasText: 'Timer' }).click()
  await ck.locator('.timer__display').waitFor()
  check('timer panel renders', /\d{2}:\d{2}/.test((await ck.locator('.timer__display').textContent()) ?? ''))

  await ck.locator('.tabs__item', { hasText: 'Alarms' }).click()
  await ck.getByText('New alarm').click()
  await ck.locator('gf-modal[open]').waitFor()
  await ck.locator('gf-modal[open] gf-input input[type="time"]').fill('23:59')
  await ck.locator('gf-modal[open] gf-input input[type="text"]').fill('Smoke clock')
  await ck.locator('gf-modal[open] gf-button', { hasText: 'Save' }).click()
  await ck.locator('.alarm', { hasText: 'Smoke clock' }).waitFor({ timeout: 5000 })
  check('alarm created in the Clock app', true)

  await ck.locator('.tabs__item', { hasText: 'Timer' }).click()
  await ck.locator('.timer__display').waitFor()
  await ck.locator('.panel:not([hidden]) gf-button', { hasText: 'Start' }).click()
  await page.waitForTimeout(500)
  check('timer starts (countdown scheduled)', (await ck.locator('gf-button', { hasText: 'Pause' }).count()) > 0)

  await page.locator('#nav').getByText('Activity').click()
  const clockAlarm = page.locator('.activity-row', { hasText: 'Smoke clock' })
  await clockAlarm.waitFor({ timeout: 10000 })
  check('clock alarm appears in the Activity center', true)
  const clockTimer = page.locator('.activity-row', { hasText: 'Timer' }).first()
  check('clock timer appears in the Activity center', (await clockTimer.count()) > 0)
  await clockAlarm.getByText('Cancel').click()
  await clockTimer.getByText('Cancel').click()
  await page.waitForTimeout(300)

  // Scheduler: reminder UI, bridge round-trip, shell firing, persistence
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const calendarCard = page.locator('.app-card').filter({ hasText: 'Calendar' }).first()
  await calendarCard.hover()
  await calendarCard.getByText('Open').click()
  const cf = page.frameLocator('iframe.app-frame')
  await cf.locator('.calendar').waitFor({ timeout: 15000 })

  await cf.getByText('New event').click()
  await cf.locator('gf-modal[open]').waitFor()
  const remindFields = await cf
    .locator('gf-modal[open] gf-form-field')
    .filter({ hasText: 'Remind me' })
    .count()
  check('Calendar exposes a reminder control', remindFields > 0)
  await cf.locator('gf-modal[open] gf-button', { hasText: 'Cancel' }).click()

  const calendarFrame = page.frames().find((frame) => frame.url().includes('/apps/calendar/'))
  const quick = await calendarFrame.evaluate(() =>
    window.GF.scheduler.schedule({ kind: 'notification', title: 'Smoke timer', delayMs: 500 }),
  )
  check('scheduler.schedule round-trips through the bridge', !!quick?.id)
  await page.locator('.toast', { hasText: 'Smoke timer' }).first().waitFor({ timeout: 8000 })
  check('scheduled entry fires in the shell', true)

  await calendarFrame.evaluate(() =>
    window.GF.scheduler.schedule({ kind: 'alarm', title: 'Persisted alarm', delayMs: 120000 }),
  )
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  await page.locator('#nav').getByText('Activity').click()
  const persisted = page.locator('.activity-row', { hasText: 'Persisted alarm' })
  await persisted.waitFor({ timeout: 10000 })
  check('scheduled entry persists in the Activity center', true)
  await persisted.getByText('Cancel').click()
  await page.waitForTimeout(300)
  check('cancel removes the entry', (await persisted.count()) === 0)

  // Radio app: Radio Browser catalog, now-playing bar and favorites
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const radioCard = page
    .locator('.app-card', { has: page.locator('.app-card__name', { hasText: /^Radio$/ }) })
    .first()
  check('Radio app discovered', (await radioCard.count()) > 0)
  await radioCard.hover()
  await radioCard.getByText('Open').click()
  const ra = page.frameLocator('iframe.app-frame')
  await ra.locator('.radio-toolbar').waitFor({ timeout: 15000 })
  await ra.locator('.station-card:not(.station-card--skeleton)').first().waitFor({ timeout: 30000 })
  const stationCount = await ra.locator('.station-card:not(.station-card--skeleton)').count()
  check('radio loads top stations from Radio Browser', stationCount > 0, `${stationCount} station(s)`)

  await ra.locator('.station-card:not(.station-card--skeleton)').first().click()
  await ra.locator('.now-playing').waitFor({ timeout: 15000 })
  check('radio now-playing bar appears', await ra.locator('.now-playing__title').isVisible())

  await ra.locator('.station-card:not(.station-card--skeleton) .star').first().click()
  await ra.locator('.view-bar gf-chip', { hasText: 'Favorites' }).click()
  await page.waitForTimeout(300)
  check('radio favorite saved', (await ra.locator('.station-card').count()) > 0)

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('unexpected failure', false, String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
