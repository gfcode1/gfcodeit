import type { Panel, PanelContext } from './types'
import { el } from './dom'
import { formatClock, formatDate } from './format'

export function createClockPanel(ctx: PanelContext): Panel {
  let timer: number | null = null

  const root = el('div', 'panel')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Clock')
  header.setAttribute('subtitle', 'Local time')

  const time = el('div', 'clock__time')
  const date = el('div', 'clock__date')

  const hour12 = el('gf-switch')
  const hour12Field = el('gf-form-field')
  hour12Field.setAttribute('label', '12-hour clock')
  hour12Field.append(hour12)

  const seconds = el('gf-switch')
  const secondsField = el('gf-form-field')
  secondsField.setAttribute('label', 'Show seconds')
  secondsField.append(seconds)

  const options = el('gf-card')
  const row = el('div', 'row row--between')
  row.append(hour12Field, secondsField)
  options.append(row)

  root.append(header, time, date, options)

  function renderTime(): void {
    const now = new Date()
    time.textContent = formatClock(now, ctx.prefs.hour12, ctx.prefs.showSeconds)
    date.textContent = formatDate(now)
  }

  function syncSwitches(): void {
    hour12.toggleAttribute('checked', ctx.prefs.hour12)
    seconds.toggleAttribute('checked', ctx.prefs.showSeconds)
  }

  hour12.addEventListener('gf-change', () => {
    void ctx.savePrefs({ hour12: hour12.hasAttribute('checked') }).then(renderTime)
  })
  seconds.addEventListener('gf-change', () => {
    void ctx.savePrefs({ showSeconds: seconds.hasAttribute('checked') }).then(renderTime)
  })

  return {
    el: root,
    activate() {
      renderTime()
      if (timer === null) timer = window.setInterval(renderTime, 1000)
    },
    deactivate() {
      if (timer !== null) window.clearInterval(timer)
      timer = null
    },
    reload() {
      syncSwitches()
      renderTime()
    },
  }
}
