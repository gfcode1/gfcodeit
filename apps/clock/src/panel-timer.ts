import type { Panel, PanelContext, TimerState } from './types'
import type { ScheduleItem } from '../../../src/core/types'
import { el } from './dom'
import { formatDuration } from './format'

const KEY = 'timer'
const PRESETS_MIN = [1, 3, 5, 10, 15, 30]
const DEFAULT_MS = 5 * 60_000

function defaultState(): TimerState {
  return { status: 'idle', durationMs: DEFAULT_MS, endAt: 0, remainingMs: DEFAULT_MS, label: 'Timer' }
}

export async function createTimerPanel(ctx: PanelContext): Promise<Panel> {
  let state: TimerState = defaultState()
  let tick: number | null = null

  const root = el('div', 'panel')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Timer')
  header.setAttribute('subtitle', 'Counts down and rings even if the app is closed.')

  const display = el('div', 'timer__display')
  const progress = el('gf-progress')
  progress.setAttribute('max', String(state.durationMs))

  const presets = el('div', 'row')
  const actions = el('div', 'row')

  const customInput = el('gf-input')
  customInput.setAttribute('type', 'number')
  customInput.setAttribute('min', '1')
  customInput.setAttribute('step', '1')
  customInput.setAttribute('placeholder', 'Minutes')
  const customField = el('gf-form-field')
  customField.setAttribute('label', 'Custom (minutes)')
  customField.append(customInput)
  const customSet = el('gf-button')
  customSet.setAttribute('size', 'sm')
  customSet.textContent = 'Set'
  customSet.addEventListener('click', () => {
    const minutes = Math.max(1, Math.floor(Number(customInput.value) || 0))
    void selectDuration(minutes * 60_000)
  })
  const customRow = el('div', 'row row--end')
  customRow.append(customField, customSet)

  root.append(header, display, progress, presets, customRow, actions)

  async function persist(): Promise<void> {
    await ctx.gf.storage.set(KEY, state)
  }

  function remaining(): number {
    if (state.status === 'running') return Math.max(0, state.endAt - Date.now())
    if (state.status === 'done') return 0
    return state.remainingMs
  }

  function updateDisplay(): void {
    const left = remaining()
    display.textContent = formatDuration(left)
    const elapsed = Math.max(0, state.durationMs - left)
    progress.setAttribute('max', String(state.durationMs))
    progress.setAttribute('value', String(Math.min(state.durationMs, elapsed)))
    progress.setAttribute('label', state.status === 'done' ? 'Done' : 'Remaining')
  }

  function stopTick(): void {
    if (tick !== null) window.clearInterval(tick)
    tick = null
  }

  function startTick(): void {
    stopTick()
    tick = window.setInterval(() => {
      updateDisplay()
      if (state.status === 'running' && state.endAt <= Date.now()) {
        state = { ...state, status: 'done', remainingMs: 0, endAt: 0, schedulerId: undefined }
        void persist()
        stopTick()
        render()
      }
    }, 250)
  }

  async function run(remainingMs: number): Promise<void> {
    if (remainingMs <= 0) return
    const endAt = Date.now() + remainingMs
    const item = await ctx.gf.scheduler.schedule({
      kind: 'timer',
      title: state.label || 'Timer',
      body: formatDuration(remainingMs),
      fireAt: endAt,
      sound: true,
      deepLink: '#/app/clock',
      icon: '23F2',
    })
    state = { ...state, status: 'running', endAt, remainingMs, schedulerId: item.id }
    await persist()
    render()
    startTick()
  }

  async function selectDuration(durationMs: number): Promise<void> {
    if (state.status === 'running') return
    state = { ...state, status: 'idle', durationMs, remainingMs: durationMs, endAt: 0, schedulerId: undefined }
    await persist()
    render()
  }

  async function pause(): Promise<void> {
    if (state.status !== 'running') return
    if (state.schedulerId) await ctx.gf.scheduler.cancel(state.schedulerId).catch(() => undefined)
    state = { ...state, status: 'paused', remainingMs: Math.max(0, state.endAt - Date.now()), schedulerId: undefined }
    await persist()
    stopTick()
    render()
  }

  async function reset(): Promise<void> {
    if (state.schedulerId) await ctx.gf.scheduler.cancel(state.schedulerId).catch(() => undefined)
    state = { ...state, status: 'idle', endAt: 0, remainingMs: state.durationMs, schedulerId: undefined }
    await persist()
    stopTick()
    render()
  }

  function button(label: string, onClick: () => void, variant?: string): HTMLElement {
    const node = el('gf-button')
    node.textContent = label
    if (variant) node.setAttribute('variant', variant)
    node.addEventListener('click', onClick)
    return node
  }

  function render(): void {
    updateDisplay()

    presets.innerHTML = ''
    for (const minutes of PRESETS_MIN) {
      const chip = el('gf-chip')
      chip.textContent = `${minutes}m`
      if (state.status !== 'running' && state.durationMs === minutes * 60_000) chip.setAttribute('active', '')
      if (state.status === 'running') chip.setAttribute('disabled', '')
      chip.addEventListener('gf-chip-toggle', () => void selectDuration(minutes * 60_000))
      presets.append(chip)
    }
    customRow.hidden = state.status === 'running'

    actions.innerHTML = ''
    if (state.status === 'idle') {
      actions.append(
        button('Start', () => void run(state.durationMs), 'primary'),
        button('Reset', () => void reset(), 'ghost'),
      )
    } else if (state.status === 'running') {
      actions.append(button('Pause', () => void pause()), button('Reset', () => void reset(), 'ghost'))
    } else if (state.status === 'paused') {
      actions.append(
        button('Resume', () => void run(state.remainingMs), 'primary'),
        button('Reset', () => void reset(), 'ghost'),
      )
    } else {
      actions.append(
        button('Restart', () => void run(state.durationMs), 'primary'),
        button('Reset', () => void reset(), 'ghost'),
      )
    }
  }

  async function load(): Promise<void> {
    state = (await ctx.gf.storage.get<TimerState>(KEY)) ?? defaultState()
    if (state.status === 'running' && state.endAt <= Date.now()) {
      state = { ...state, status: 'done', remainingMs: 0, endAt: 0, schedulerId: undefined }
      await persist()
    }
    render()
    if (state.status === 'running') startTick()
  }

  await load()

  return {
    el: root,
    activate() {
      if (state.status === 'running') startTick()
      updateDisplay()
    },
    deactivate() {
      stopTick()
    },
    reload() {
      void load()
    },
    onSchedulerFired(item: ScheduleItem) {
      if (item.kind !== 'timer' || item.id !== state.schedulerId) return
      state = { ...state, status: 'done', remainingMs: 0, endAt: 0, schedulerId: undefined }
      void persist()
      stopTick()
      render()
    },
  }
}
