import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/gfcodeit/'
const executablePath = process.env.CHROME

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition, detail })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

/** Tiny silent WAV as a data URI, used to exercise the media hub without network. */
function silentWav() {
  const rate = 8000
  const data = Buffer.alloc(rate / 2, 0x80)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return 'data:audio/wav;base64,' + Buffer.concat([header, data]).toString('base64')
}

/** True when the media bar is laid out with a real height inside the viewport. */
async function mediaBarFit(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#media-bar')
    if (!el || el.hasAttribute('hidden')) return { visible: false, height: 0, inside: false }
    const rect = el.getBoundingClientRect()
    return {
      visible: getComputedStyle(el).display !== 'none',
      height: Math.round(rect.height),
      inside: rect.height > 0 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
    }
  })
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

  // Home search bar opens the command palette
  await page.locator('.launcher__search').click()
  await page.locator('.palette').waitFor()
  check('home search bar opens command palette', true)
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

  const badKind = await calendarFrame.evaluate(() =>
    window.GF.scheduler
      .schedule({ kind: 'bogus', title: 'x', delayMs: 1000 })
      .then(() => 'allowed')
      .catch((error) => error.code),
  )
  check('scheduler rejects an unknown kind', badKind === 'E_SCHEDULE', String(badKind))

  const badInterval = await calendarFrame.evaluate(() =>
    window.GF.scheduler
      .schedule({ kind: 'timer', title: 'x', delayMs: 1000, repeat: { mode: 'interval', everyMs: 10 } })
      .then(() => 'allowed')
      .catch((error) => error.code),
  )
  check('scheduler rejects sub-second intervals', badInterval === 'E_SCHEDULE', String(badInterval))

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

  // Calculator: keypad, keyboard, memory, history and persistence
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const calcCard = page.locator('.app-card').filter({ hasText: 'Calculator' }).first()
  check('Calculator app discovered', (await calcCard.count()) > 0)
  await calcCard.hover()
  await calcCard.getByText('Open').click()
  const cc = page.frameLocator('iframe.app-frame')
  await cc.locator('.calc-keys').waitFor({ timeout: 15000 })

  const tapKey = (label) => cc.locator('.calc-keys gf-button').filter({ hasText: label }).first().click()
  const tapMemory = (label) =>
    cc.locator('.calc-memory gf-button').filter({ hasText: label }).first().click()
  const calcResult = async () => ((await cc.locator('.calc-display__result').textContent()) ?? '').trim()

  for (const label of ['1', '2', '+', '3', '4']) await tapKey(label)
  await tapKey('=')
  check('calculator keypad evaluates a sum', (await calcResult()) === '46', await calcResult())

  await cc.locator('.calc-display__expr').click()
  for (const key of ['7', '*', '8']) await page.keyboard.press(key)
  await page.keyboard.press('Enter')
  check('calculator handles physical keyboard', (await calcResult()) === '56', await calcResult())
  await page.keyboard.press('Backspace')
  check('calculator backspace edits the entry', (await calcResult()) === '5', await calcResult())
  await page.keyboard.press('Escape')
  check('calculator escape clears the entry', (await calcResult()) === '0', await calcResult())

  await tapKey('9')
  await tapMemory('M+')
  check('calculator memory indicator shows', await cc.locator('.calc-display__memory').isVisible())
  await tapKey('AC')
  await tapMemory('MR')
  check('calculator recalls memory', (await calcResult()) === '9', await calcResult())
  await tapMemory('MC')
  check('calculator clears memory', !(await cc.locator('.calc-display__memory').isVisible()))

  await cc.locator('gf-page-header gf-button', { hasText: 'History' }).click()
  await cc.locator('gf-modal[open] .calc-history').waitFor({ timeout: 5000 })
  const historyRows = await cc.locator('gf-modal[open] .calc-history__row').count()
  check('calculator records history', historyRows >= 2, `${historyRows} row(s)`)
  await cc.locator('gf-modal[open] .calc-history__row').first().click()
  await cc.locator('gf-modal[open]').waitFor({ state: 'detached', timeout: 5000 })
  const reused = ((await cc.locator('.calc-display__expr').textContent()) ?? '').trim()
  check('calculator history entry can be reused', reused.length > 0, reused)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const calcCard2 = page.locator('.app-card').filter({ hasText: 'Calculator' }).first()
  await calcCard2.hover()
  await calcCard2.getByText('Open').click()
  const cc2 = page.frameLocator('iframe.app-frame')
  await cc2.locator('.calc-keys').waitFor({ timeout: 15000 })
  await cc2.locator('gf-page-header gf-button', { hasText: 'History' }).click()
  await cc2.locator('gf-modal[open] .calc-history').waitFor({ timeout: 5000 })
  const persistedRows = await cc2.locator('gf-modal[open] .calc-history__row').count()
  check('calculator history persists across reload', persistedRows >= 2, `${persistedRows} row(s)`)

  await cc2.locator('gf-modal[open] gf-button', { hasText: 'Clear' }).click()
  const shellConfirm = page.locator('gf-modal[open]', { hasText: 'Clear all history?' })
  await shellConfirm.waitFor({ timeout: 5000 })
  await shellConfirm.locator('gf-button', { hasText: 'Confirm' }).click()
  await cc2.locator('gf-modal[open]').waitFor({ state: 'detached', timeout: 5000 })
  await cc2.locator('gf-page-header gf-button', { hasText: 'History' }).click()
  await cc2.locator('gf-modal[open] gf-empty-state').waitFor({ timeout: 5000 })
  check('calculator history can be cleared', true)

  // News app: bundled awesome-rss-feeds catalog, adding feeds, OPML export
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const newsCard = page
    .locator('.app-card', { has: page.locator('.app-card__name', { hasText: /^News$/ }) })
    .first()
  check('News app discovered', (await newsCard.count()) > 0)
  await newsCard.hover()
  await newsCard.getByText('Open').click()
  const nw = page.frameLocator('iframe.app-frame')
  await nw.locator('.news-nav').waitFor({ timeout: 15000 })

  await nw.locator('.news-nav gf-chip', { hasText: 'Browse' }).click()
  await nw.locator('.catalog-list gf-accordion-item').first().waitFor({ timeout: 15000 })
  const catalogCount = await nw.locator('.catalog-feed').count()
  check('news catalog renders from bundled JSON', catalogCount > 0, `${catalogCount} visible`)

  await nw.locator('.catalog-search input').fill('Ars Technica')
  await page.waitForTimeout(200)
  await nw.locator('.catalog-feed', { hasText: 'Ars Technica' }).first().waitFor({ timeout: 5000 })
  await nw
    .locator('.catalog-feed', { hasText: 'Ars Technica' })
    .first()
    .locator('gf-button', { hasText: 'Add' })
    .click()
  await page.waitForTimeout(300)
  await nw.locator('.news-nav gf-chip', { hasText: 'Feeds' }).click()
  await nw.locator('.feed-row').first().waitFor({ timeout: 10000 })
  check('news feed added from catalog', (await nw.locator('.feed-row').count()) >= 1)

  const [newsDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
    nw.locator('.news-toolbar gf-button', { hasText: 'Export OPML' }).click(),
  ])
  check('news exports OPML', !!newsDownload, newsDownload ? newsDownload.suggestedFilename() : 'no download')

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  await newsCard.hover()
  await newsCard.getByText('Open').click()
  const nw2 = page.frameLocator('iframe.app-frame')
  await nw2.locator('.news-nav gf-chip', { hasText: 'Feeds' }).click()
  await nw2.locator('.feed-row').first().waitFor({ timeout: 15000 })
  check('news feeds persist across reload', (await nw2.locator('.feed-row').count()) >= 1)

  // Centralized audio: the shell owns playback, so it survives app switches
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const soundscapeCard = page.locator('.app-card').filter({ hasText: 'Soundscape' }).first()
  check('Soundscape app discovered', (await soundscapeCard.count()) > 0)
  await soundscapeCard.hover()
  await soundscapeCard.getByText('Open').click()
  const sc = page.frameLocator('iframe.app-frame')
  await sc.locator('.sound-card').first().waitFor({ timeout: 15000 })
  await sc.locator('.sound-card').first().click()
  await page.waitForSelector('#media-bar:not([hidden])', { timeout: 10000 })
  await page.waitForTimeout(800)
  check('global media bar appears for shell-owned playback', await page.locator('#media-bar').isVisible())
  check(
    'media bar shows the owning app',
    ((await page.locator('.media-bar__title').textContent()) ?? '').trim() === 'Soundscape',
    await page.locator('.media-bar__title').textContent(),
  )

  await sc.locator('.sound-card').nth(1).click()
  await page.waitForTimeout(500)
  check(
    'media bar mixes multiple sources',
    ((await page.locator('.media-bar__meta').textContent()) ?? '').includes('2 sounds'),
    await page.locator('.media-bar__meta').textContent(),
  )

  await page.locator('#topbar').getByLabel('Back').click()
  await page.waitForSelector('.app-card', { timeout: 10000 })
  check('audio keeps playing on the launcher', await page.locator('#media-bar').isVisible())

  // The bar must stay on screen at both mobile and desktop widths (the desktop
  // grid used to place it in a 0-height row, below the fold).
  const mobileFit = await mediaBarFit(page)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(250)
  const desktopFit = await mediaBarFit(page)
  await page.setViewportSize({ width: 420, height: 860 })
  await page.waitForTimeout(250)
  check(
    'media bar stays inside the viewport (mobile + desktop)',
    mobileFit.inside && desktopFit.inside,
    `mobile=${JSON.stringify(mobileFit)} desktop=${JSON.stringify(desktopFit)}`,
  )

  // Opening a non-media app unmounts the Soundscape iframe; audio must persist.
  const todoMediaCard = page.locator('.app-card').filter({ hasText: 'Todo' }).first()
  await todoMediaCard.hover()
  await todoMediaCard.getByText('Open').click()
  const tm = page.frameLocator('iframe.app-frame')
  await tm.locator('.todo-toolbar').waitFor({ timeout: 15000 })
  const mediaStatus = await page.locator('#media-bar').getAttribute('data-status')
  check(
    'shell-owned audio survives switching to another app',
    (await page.locator('#media-bar').isVisible()) && (mediaStatus === 'playing' || mediaStatus === 'loading'),
    `status=${mediaStatus}`,
  )

  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(250)
  const appDesktopFit = await mediaBarFit(page)
  await page.setViewportSize({ width: 420, height: 860 })
  await page.waitForTimeout(250)
  check('media bar stays inside the viewport inside apps (desktop)', appDesktopFit.inside, JSON.stringify(appDesktopFit))

  const todoMediaFrame = page.frames().find((frame) => frame.url().includes('/apps/todo/'))
  const denied = await todoMediaFrame.evaluate(() =>
    window.GF.media.list().then(() => 'allowed').catch((error) => error.code),
  )
  check('media permission is enforced per app', denied === 'E_PERMISSION', String(denied))

  // Exclusive playback: starting a stream in Radio stops Soundscape.
  await page.locator('#topbar').getByLabel('Back').click()
  await page.waitForSelector('.app-card', { timeout: 10000 })
  const radioMediaCard = page
    .locator('.app-card', { has: page.locator('.app-card__name', { hasText: /^Radio$/ }) })
    .first()
  await radioMediaCard.hover()
  await radioMediaCard.getByText('Open').click()
  const rm = page.frameLocator('iframe.app-frame')
  await rm.locator('.radio-toolbar').waitFor({ timeout: 15000 })
  const radioMediaFrame = page.frames().find((frame) => frame.url().includes('/apps/radio/'))
  const handedOff = await radioMediaFrame.evaluate(
    (url) =>
      window.GF.media
        .play('stream', { url, loop: true, title: 'Smoke stream', volume: 0.4 })
        .then((state) => state.status),
    silentWav(),
  )
  check('app can hand a stream to the shell hub', handedOff === 'playing' || handedOff === 'loading', String(handedOff))
  await page.waitForTimeout(600)
  check(
    'starting audio elsewhere takes over exclusively',
    ((await page.locator('.media-bar__title').textContent()) ?? '').trim() === 'Smoke stream',
    await page.locator('.media-bar__title').textContent(),
  )

  await page.locator('.media-bar__controls button[aria-label="Pause"]').click()
  await page.waitForTimeout(400)
  const pausedStatus = await radioMediaFrame.evaluate(() => window.GF.media.list().then((sources) => sources[0]?.status))
  check('global media bar can pause playback', pausedStatus === 'paused', String(pausedStatus))

  const badMedia = await radioMediaFrame.evaluate(() =>
    window.GF.media
      .play('bad', { url: 'javascript:alert(1)' })
      .then(() => 'allowed')
      .catch((error) => error.code),
  )
  check('media rejects non-audio URL schemes', badMedia === 'E_PARAM', String(badMedia))

  const badRpc = await radioMediaFrame.evaluate(() =>
    window.GF.ui.confirm(123).then(() => 'ok').catch((error) => error.code),
  )
  check('RPC rejects malformed params', badRpc === 'E_PARAM', String(badRpc))

  const traversal = await radioMediaFrame.evaluate(() => window.GF.icons.url('../../package.json'))
  check('icon URL rejects path traversal', traversal.startsWith('data:'), traversal)
  const iconOk = await radioMediaFrame.evaluate(() => window.GF.icons.url('1f4dd'))
  check('icon URL resolves a valid codepoint', iconOk.endsWith('/1F4DD.svg'), iconOk)

  // Arcade app: game catalog, canvas stage, keyboard pause, settings, lazy games
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card', { timeout: 15000 })
  const arcadeCard = page.locator('.app-card').filter({ hasText: 'Arcade' }).first()
  check('Arcade app discovered', (await arcadeCard.count()) > 0)
  await arcadeCard.hover()
  await arcadeCard.getByText('Open').click()
  const ar = page.frameLocator('iframe.app-frame')
  await ar.locator('.arcade-grid').waitFor({ timeout: 15000 })
  const tileCount = await ar.locator('.arcade-tile').count()
  check('arcade lists the game catalog', tileCount >= 8, `${tileCount} tile(s)`)

  await ar.locator('.arcade-tile', { hasText: 'Snake' }).click()
  await ar.locator('.arcade-canvas').waitFor({ timeout: 5000 })
  await ar.locator('.arcade-overlay[data-state="ready"]').waitFor({ timeout: 5000 })
  check('arcade mounts a ready overlay', true)
  await ar.locator('.arcade-overlay gf-button', { hasText: 'Tap to start' }).click()
  await ar.locator('.arcade-overlay').waitFor({ state: 'hidden', timeout: 5000 })
  await page.waitForTimeout(400)

  const arcadeFrame = page.frames().find((frame) => frame.url().includes('/apps/arcade/'))
  const canvasInfo = await arcadeFrame.evaluate(() => {
    const canvas = document.querySelector('canvas.arcade-canvas')
    if (!canvas) return { ok: false }
    const ctx = canvas.getContext('2d')
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) painted += 1
      if (painted > 2000) break
    }
    return { ok: canvas.width > 0 && painted > 2000, width: canvas.width, painted }
  })
  check('arcade canvas renders pixels', canvasInfo.ok, JSON.stringify(canvasInfo))

  const hudLine = ((await ar.locator('.arcade-hud__stat').first().textContent()) ?? '').trim()
  check('arcade HUD shows a score line', /SCORE \d{5}/.test(hudLine), hudLine)

  await page.keyboard.press('KeyP')
  await ar.locator('.arcade-overlay[data-state="paused"]').waitFor({ timeout: 5000 })
  check('arcade pauses with the keyboard', true)
  await ar.locator('.arcade-overlay gf-button', { hasText: 'Resume' }).click()
  await page.waitForTimeout(300)
  check('arcade resumes', await ar.locator('.arcade-overlay').first().isHidden())

  await ar.locator('.arcade-hud gf-button', { hasText: 'Menu' }).click()
  const arcadeQuit = page.locator('gf-modal[open]', { hasText: 'Leave the current game?' })
  await arcadeQuit.waitFor({ timeout: 5000 })
  await arcadeQuit.locator('gf-button', { hasText: 'Confirm' }).click()
  await ar.locator('.arcade-grid').waitFor({ timeout: 5000 })
  check('arcade returns to the game menu', true)

  await ar.locator('gf-page-header gf-button', { hasText: 'Settings' }).click()
  await ar.locator('gf-modal[open]', { hasText: 'Arcade settings' }).waitFor({ timeout: 5000 })
  await ar.locator('gf-modal[open] gf-switch').click()
  await ar.locator('gf-modal[open] gf-button', { hasText: 'Close' }).click()
  await ar.locator('gf-modal[open]').waitFor({ state: 'detached', timeout: 5000 })
  check('arcade settings modal toggles sound', true)

  await ar.locator('.arcade-tile', { hasText: '2048' }).click()
  await ar.locator('.arcade-overlay[data-state="ready"]').waitFor({ timeout: 5000 })
  check('arcade lazy-loads a second game', true)

  // A newly added game must open, start and paint the canvas.
  await ar.locator('.arcade-hud gf-button', { hasText: 'Menu' }).click()
  await ar.locator('.arcade-grid').waitFor({ timeout: 5000 })
  await ar.locator('.arcade-tile', { hasText: 'Lights Out' }).click()
  await ar.locator('.arcade-overlay[data-state="ready"]').waitFor({ timeout: 5000 })
  await ar.locator('.arcade-overlay gf-button', { hasText: 'Tap to start' }).click()
  await ar.locator('.arcade-overlay').waitFor({ state: 'hidden', timeout: 5000 })
  await page.waitForTimeout(300)
  const newGameInfo = await arcadeFrame.evaluate(() => {
    const canvas = document.querySelector('canvas.arcade-canvas')
    if (!canvas) return { ok: false }
    const ctx = canvas.getContext('2d')
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0) painted += 1
      if (painted > 2000) break
    }
    return { ok: canvas.width > 0 && painted > 2000, width: canvas.width, painted }
  })
  check('new arcade game starts and paints', newGameInfo.ok, JSON.stringify(newGameInfo))

  const appUrls = page
    .frames()
    .map((frame) => frame.url())
    .filter((url) => url.includes('/apps/'))
  check(
    'bridge token is stripped from app URLs',
    appUrls.length > 0 && appUrls.every((url) => !url.includes('gf-token')),
    appUrls.join(' | '),
  )

  const shellCsp = await page.evaluate(
    () =>
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '',
  )
  check('production shell ships a CSP', /object-src 'none'/.test(shellCsp), shellCsp.slice(0, 48))

  check('no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('unexpected failure', false, String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
