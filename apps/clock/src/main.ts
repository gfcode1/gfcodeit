import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import type { ScheduleItem } from '../../../src/core/types'
import type { Panel, PanelContext, Prefs, Tab } from './types'
import { el } from './dom'
import { createClockPanel } from './panel-clock'
import { createTimerPanel } from './panel-timer'
import { createAlarmPanel } from './panel-alarm'
import { createStopwatchPanel } from './panel-stopwatch'

const PREFS_KEY = 'prefs'
const DEFAULT_PREFS: Prefs = { hour12: false, showSeconds: true, tab: 'clock' }
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'clock', label: 'Clock', icon: '1F550' },
  { id: 'timer', label: 'Timer', icon: '23F2' },
  { id: 'alarm', label: 'Alarms', icon: '1F514' },
  { id: 'stopwatch', label: 'Stopwatch', icon: '23F1' },
]

async function bootstrapRuntime(): Promise<GFApi> {
  const base = import.meta.env.BASE_URL
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${base}framework/v1/tokens.css`
  document.head.append(link)

  await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
  return window.GF_READY
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  const stored = (await gf.storage.get<Prefs>(PREFS_KEY)) ?? {}
  const ctx: PanelContext = {
    gf,
    prefs: { ...DEFAULT_PREFS, ...stored },
    async savePrefs(patch) {
      ctx.prefs = { ...ctx.prefs, ...patch }
      await gf.storage.set(PREFS_KEY, ctx.prefs)
    },
    toast: (message, options) => gf.ui.toast(message, options),
  }

  const panels: Record<Tab, Panel> = {
    clock: await createClockPanel(ctx),
    timer: await createTimerPanel(ctx),
    alarm: await createAlarmPanel(ctx),
    stopwatch: await createStopwatchPanel(ctx),
  }

  let active: Tab = TABS.some((tab) => tab.id === ctx.prefs.tab) ? ctx.prefs.tab : 'clock'

  const tabsBar = el('div', 'tabs')
  const host = el('div', 'panel-host')
  for (const tab of TABS) host.append(panels[tab.id].el)
  root.append(tabsBar, host)

  function renderTabs(): void {
    tabsBar.innerHTML = ''
    for (const tab of TABS) {
      const node = el('button', 'tabs__item')
      node.type = 'button'
      if (tab.id === active) node.classList.add('is-active')
      const icon = el('gf-icon')
      icon.setAttribute('codepoint', tab.icon)
      icon.setAttribute('size', '20px')
      const label = el('span')
      label.textContent = tab.label
      node.append(icon, label)
      node.addEventListener('click', () => show(tab.id))
      tabsBar.append(node)
    }
  }

  function show(tab: Tab): void {
    active = tab
    for (const entry of TABS) {
      const panel = panels[entry.id]
      if (entry.id === tab) {
        panel.el.hidden = false
        panel.activate()
      } else {
        panel.deactivate()
        panel.el.hidden = true
      }
    }
    renderTabs()
    void ctx.savePrefs({ tab })
  }

  gf.on('scheduler:fired', (item: ScheduleItem) => {
    for (const entry of TABS) panels[entry.id].onSchedulerFired?.(item)
  })

  gf.on('profileChanged', () => {
    void (async () => {
      ctx.prefs = { ...DEFAULT_PREFS, ...((await gf.storage.get<Prefs>(PREFS_KEY)) ?? {}) }
      for (const entry of TABS) panels[entry.id].reload()
      if (TABS.some((tab) => tab.id === ctx.prefs.tab)) show(ctx.prefs.tab)
    })()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') panels[active].activate()
    else panels[active].deactivate()
  })

  show(active)
}

void start()
