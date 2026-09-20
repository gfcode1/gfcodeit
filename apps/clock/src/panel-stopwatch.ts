import type { Panel, PanelContext, StopwatchState } from './types'
import { el } from './dom'
import { formatStopwatch } from './format'

const KEY = 'stopwatch'

function defaultState(): StopwatchState {
  return { running: false, startedAt: 0, accumulatedMs: 0, laps: [] }
}

export async function createStopwatchPanel(ctx: PanelContext): Promise<Panel> {
  let state: StopwatchState = defaultState()
  let tick: number | null = null

  const root = el('div', 'panel')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Stopwatch')
  header.setAttribute('subtitle', 'Keeps running across reloads.')

  const display = el('div', 'stopwatch__display')
  const actions = el('div', 'row')
  const laps = el('div', 'laps')
  root.append(header, display, actions, laps)

  function elapsed(): number {
    return state.accumulatedMs + (state.running ? Date.now() - state.startedAt : 0)
  }

  async function persist(): Promise<void> {
    await ctx.gf.storage.set(KEY, state)
  }

  function updateDisplay(): void {
    display.textContent = formatStopwatch(elapsed())
  }

  function stopTick(): void {
    if (tick !== null) window.clearInterval(tick)
    tick = null
  }

  function startTick(): void {
    stopTick()
    tick = window.setInterval(updateDisplay, 50)
  }

  async function start(): Promise<void> {
    if (state.running) return
    state = { ...state, running: true, startedAt: Date.now() }
    await persist()
    render()
    startTick()
  }

  async function pause(): Promise<void> {
    if (!state.running) return
    state = { ...state, running: false, accumulatedMs: elapsed(), startedAt: 0 }
    await persist()
    stopTick()
    render()
  }

  async function reset(): Promise<void> {
    state = defaultState()
    await persist()
    stopTick()
    render()
  }

  async function lap(): Promise<void> {
    if (!state.running) return
    state = { ...state, laps: [...state.laps, elapsed()] }
    await persist()
    render()
  }

  function button(label: string, onClick: () => void, variant?: string): HTMLElement {
    const node = el('gf-button')
    node.textContent = label
    if (variant) node.setAttribute('variant', variant)
    node.addEventListener('click', onClick)
    return node
  }

  function renderLaps(): void {
    laps.innerHTML = ''
    if (state.laps.length === 0) return
    const head = el('div', 'laps__row laps__head')
    for (const text of ['Lap', 'Split', 'Total']) {
      const cell = el('span')
      cell.textContent = text
      head.append(cell)
    }
    laps.append(head)
    for (let index = state.laps.length - 1; index >= 0; index -= 1) {
      const total = state.laps[index]
      const previous = index > 0 ? state.laps[index - 1] : 0
      const row = el('div', 'laps__row')
      const number = el('span')
      number.textContent = `#${index + 1}`
      const split = el('span')
      split.textContent = formatStopwatch(total - previous)
      const time = el('span')
      time.textContent = formatStopwatch(total)
      row.append(number, split, time)
      laps.append(row)
    }
  }

  function render(): void {
    updateDisplay()
    actions.innerHTML = ''
    if (state.running) {
      actions.append(button('Lap', () => void lap()), button('Pause', () => void pause(), 'primary'))
    } else {
      actions.append(button(elapsed() > 0 ? 'Resume' : 'Start', () => void start(), 'primary'))
      if (elapsed() > 0) actions.append(button('Reset', () => void reset(), 'ghost'))
    }
    renderLaps()
  }

  async function load(): Promise<void> {
    state = (await ctx.gf.storage.get<StopwatchState>(KEY)) ?? defaultState()
    render()
    if (state.running) startTick()
  }

  await load()

  return {
    el: root,
    activate() {
      if (state.running) startTick()
      updateDisplay()
    },
    deactivate() {
      stopTick()
    },
    reload() {
      void load()
    },
  }
}
