import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/gfcodeit/'
const executablePath = process.env.CHROME

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const HARNESS = `
<div id="audit" style="width:320px; padding:8px; display:flex; flex-direction:column; gap:12px; background:var(--gf-paper); color:var(--gf-ink);">
  <gf-card flat>
    <gf-form-field label="Title" help="Helper text" required>
      <gf-input placeholder="A fairly long placeholder that could overflow"></gf-input>
    </gf-form-field>
    <gf-textarea placeholder="Long text..."></gf-textarea>
    <gf-select placeholder="Choose">
      <option value="a">Option A</option>
      <option value="b">A much longer option label that might overflow the box</option>
    </gf-select>
    <gf-radio-group options='[{"value":"s","label":"Small"},{"value":"m","label":"Medium"},{"value":"l","label":"Large"}]' value="m"></gf-radio-group>
    <gf-slider min="0" max="100" value="40"></gf-slider>
    <gf-progress value="60" max="100" label="Progress"></gf-progress>
    <gf-checkbox checked>Checkbox label</gf-checkbox>
    <gf-switch checked></gf-switch>
  </gf-card>
  <gf-accordion>
    <gf-accordion-item title="First section" open>Content of the first section</gf-accordion-item>
    <gf-accordion-item title="Second section">Content of the second</gf-accordion-item>
  </gf-accordion>
  <gf-calendar value="2026-09-19"></gf-calendar>
  <gf-date-picker value="2026-09-19"></gf-date-picker>
  <div style="display:flex; gap:8px; flex-wrap:wrap;">
    <gf-button variant="primary">Primary</gf-button>
    <gf-button size="sm">Small</gf-button>
    <gf-badge variant="accent">Badge</gf-badge>
    <gf-chip active>Chip</gf-chip>
    <gf-avatar codepoint="1F464"></gf-avatar>
    <gf-icon codepoint="1F4DD" size="24px"></gf-icon>
    <gf-spinner></gf-spinner>
  </div>
  <gf-divider></gf-divider>
  <gf-skeleton height="20px"></gf-skeleton>
  <gf-page-header title="Page header" subtitle="Subtitle"></gf-page-header>
  <gf-empty-state icon="1F5C2" title="Empty" text="Nothing here"></gf-empty-state>
  <gf-emoji-picker></gf-emoji-picker>
</div>
`

const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-card')
  await page.evaluate((html) => {
    const host = document.createElement('div')
    host.id = 'audit-host'
    host.innerHTML = html
    document.body.append(host)
  }, HARNESS)
  await page.waitForTimeout(600)

  // 1. Tokens resolve
  const tokens = await page.evaluate(() =>
    [
      '--gf-paper',
      '--gf-ink',
      '--gf-muted',
      '--gf-line',
      '--gf-surface',
      '--gf-border-w',
      '--gf-radius',
      '--gf-shadow-2',
      '--gf-font-mono',
      '--gf-s2',
      '--gf-accent',
      '--gf-accent-ink',
      '--gf-focus',
    ].map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()]),
  )
  const missingTokens = tokens.filter(([, value]) => !value)
  check('design tokens defined', missingTokens.length === 0, missingTokens.map(([n]) => n).join(', '))

  // 2. No overflow of shadow content beyond each component host
  const overflows = await page.evaluate(() => {
    const problems = []
    const root = document.getElementById('audit-host')
    for (const host of root.querySelectorAll('*')) {
      if (!host.tagName.toLowerCase().startsWith('gf-')) continue
      const hostRect = host.getBoundingClientRect()
      if (hostRect.width === 0) continue
      const shadow = host.shadowRoot
      if (!shadow) continue
      for (const child of shadow.querySelectorAll('*')) {
        const rect = child.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.right > hostRect.right + 1.5 || rect.left < hostRect.left - 1.5) {
          problems.push(`${host.tagName.toLowerCase()} > ${child.className || child.tagName.toLowerCase()} (${Math.round(rect.width)}px)`)
        }
      }
    }
    return problems
  })
  check('no shadow content overflows its host', overflows.length === 0, overflows.slice(0, 6).join(', '))

  // 3. No page-level horizontal overflow
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('no page horizontal overflow', pageOverflow <= 1, `${pageOverflow}px`)

  // 4. Dark theme actually changes surfaces
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark'
  })
  await page.waitForTimeout(150)
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check('dark theme changes background', light !== dark, `${light} → ${dark}`)

  // 5. Text stays readable (colour differs from background) after theme switch
  const contrast = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor
    const fg = getComputedStyle(document.body).color
    return { bg, fg }
  })
  check('dark theme keeps ink/paper distinct', contrast.bg !== contrast.fg, `${contrast.fg} on ${contrast.bg}`)

  // 6. Accent is applied from a profile value
  const accentApplied = await page.evaluate(() => {
    document.documentElement.style.setProperty('--gf-accent', '#0057ff')
    const probe = document.createElement('div')
    probe.style.background = 'var(--gf-accent)'
    document.body.append(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  })
  check('accent token is applied', accentApplied === 'rgb(0, 87, 255)', accentApplied)

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (error) {
  check('unexpected failure', false, String(error))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
