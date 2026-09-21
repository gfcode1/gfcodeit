import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import { createSfx, type Sfx } from './engine/audio'
import { fitCanvas, observeResize } from './engine/canvas'
import { KEY_ACTIONS, PAUSE_KEYS, detectSwipe, dpadActions } from './engine/input'
import { createLoop, type Loop } from './engine/loop'
import type { GameHooks, GameInstance, PointerInput } from './engine/types'
import { pad } from './engine/format'
import { loadData, normalizeData, saveData, STORAGE_KEY, type ArcadeData } from './engine/storage'
import { CATALOG, type CatalogEntry } from './games'

type State = 'ready' | 'playing' | 'paused' | 'over'

interface Session {
  entry: CatalogEntry
  instance: GameInstance
  loop: Loop
  score: number
  dead: boolean
  size: { width: number; height: number }
}

async function bootstrapRuntime(): Promise<GFApi> {
  const base = import.meta.env.BASE_URL
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${base}framework/v1/tokens.css`
  document.head.append(link)

  await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
  return window.GF_READY
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

function iconNode(codepoint: string, size: string): HTMLElement {
  const icon = el('gf-icon')
  icon.setAttribute('codepoint', codepoint)
  icon.setAttribute('variant', 'color')
  icon.setAttribute('size', size)
  return icon
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!
  const sfx: Sfx = createSfx()

  let data: ArcadeData = await loadData(gf)
  sfx.setMuted(data.settings.muted)
  const bestLabels = new Map<string, HTMLElement>()

  const menu = el('div', 'arcade-menu')
  const header = el('gf-page-header')
  header.setAttribute('title', 'Arcade')
  const settingsButton = el('gf-button')
  settingsButton.setAttribute('slot', 'actions')
  settingsButton.setAttribute('size', 'sm')
  settingsButton.setAttribute('variant', 'ghost')
  settingsButton.textContent = 'Settings'
  settingsButton.addEventListener('click', openSettings)
  header.append(settingsButton)

  const grid = el('div', 'arcade-grid')
  for (const entry of CATALOG) {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'arcade-tile'
    const name = el('span', 'arcade-tile__name')
    name.textContent = entry.meta.name
    const best = el('span', 'arcade-tile__best')
    bestLabels.set(entry.meta.id, best)
    tile.append(iconNode(entry.meta.icon, '2.4em'), name, best)
    tile.addEventListener('click', () => {
      sfx.unlock()
      void beginSession(entry)
    })
    grid.append(tile)
  }
  menu.append(header, grid)

  const gameView = el('div', 'arcade-game')
  gameView.hidden = true

  const hud = el('div', 'arcade-hud')
  const backButton = el('gf-button')
  backButton.setAttribute('size', 'sm')
  backButton.setAttribute('variant', 'ghost')
  backButton.textContent = 'Menu'
  const hudTitle = el('div', 'arcade-hud__title')
  const scoreBox = el('div', 'arcade-hud__stat')
  const bestBox = el('div', 'arcade-hud__stat')
  const pauseButton = el('gf-button')
  pauseButton.setAttribute('size', 'sm')
  pauseButton.textContent = 'Pause'
  hud.append(backButton, hudTitle, scoreBox, bestBox, pauseButton)

  const stage = el('div', 'arcade-stage')
  const canvas = document.createElement('canvas')
  canvas.className = 'arcade-canvas'
  const overlay = el('div', 'arcade-overlay')
  overlay.hidden = true
  stage.append(canvas, overlay)

  const touch = el('div', 'arcade-touch')
  gameView.append(hud, stage, touch)
  root.append(menu, gameView)

  const ctx = canvas.getContext('2d')

  let session: Session | null = null
  let state: State = 'ready'
  let pressed = new Set<string>()
  let swipeStart: { x: number; y: number } | null = null
  let stopResize: (() => void) | null = null

  function updateTiles(): void {
    for (const entry of CATALOG) {
      const label = bestLabels.get(entry.meta.id)
      if (!label) continue
      const best = data.best[entry.meta.id] ?? 0
      label.textContent = best > 0 ? `BEST ${pad(best, 5)}` : 'BEST —'
    }
    header.setAttribute('subtitle', `${data.plays} game${data.plays === 1 ? '' : 's'} played`)
  }

  function forwardPointer(event: PointerEvent, action: PointerInput['action']): void {
    const current = session
    if (!current) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = ((event.clientX - rect.left) / rect.width) * current.size.width
    const y = ((event.clientY - rect.top) / rect.height) * current.size.height
    current.instance.onPointer?.({
      x,
      y,
      width: current.size.width,
      height: current.size.height,
      action,
    })
  }

  function showOverlay(kind: State, isRecord = false): void {
    const current = session
    overlay.hidden = false
    overlay.dataset.state = kind
    overlay.replaceChildren()
    const box = el('div', 'arcade-overlay__box')
    const title = el('h2', 'arcade-overlay__title')
    const text = el('p', 'arcade-overlay__text')
    const actions = el('div', 'arcade-overlay__actions')

    if (kind === 'ready' && current) {
      title.textContent = current.entry.meta.name
      text.textContent = current.entry.meta.help
      const go = el('gf-button')
      go.setAttribute('variant', 'primary')
      go.textContent = 'Tap to start'
      go.addEventListener('click', startRound)
      actions.append(go)
    } else if (kind === 'paused') {
      title.textContent = 'Paused'
      text.textContent = 'Take your time.'
      const resume = el('gf-button')
      resume.setAttribute('variant', 'primary')
      resume.textContent = 'Resume'
      resume.addEventListener('click', resumeGame)
      const quit = el('gf-button')
      quit.setAttribute('variant', 'ghost')
      quit.textContent = 'Quit'
      quit.addEventListener('click', closeGame)
      actions.append(resume, quit)
    } else if (kind === 'over' && current) {
      const meta = current.entry.meta
      title.textContent = 'Game over'
      text.textContent = `${meta.name} · score ${current.score} · best ${data.best[meta.id] ?? 0}`
      if (isRecord) {
        const badge = el('span', 'arcade-overlay__record')
        badge.textContent = 'New best!'
        text.append(' ', badge)
      }
      const again = el('gf-button')
      again.setAttribute('variant', 'primary')
      again.textContent = 'Play again'
      again.addEventListener('click', () => {
        if (current) void beginSession(current.entry).then(startRound)
      })
      const back = el('gf-button')
      back.setAttribute('variant', 'ghost')
      back.textContent = 'Menu'
      back.addEventListener('click', closeGame)
      actions.append(again, back)
    }

    box.append(title, text, actions)
    overlay.append(box)
  }

  function hideOverlay(): void {
    overlay.hidden = true
  }

  function fit(): void {
    const current = session
    if (!current) return
    const size = fitCanvas(canvas, stage, current.entry.meta.aspect)
    current.size = size
    current.instance.resize?.(size.width, size.height)
  }

  function updateHud(): void {
    const current = session
    if (!current) return
    const best = data.best[current.entry.meta.id] ?? 0
    scoreBox.textContent = `SCORE ${pad(current.score, 5)}`
    bestBox.textContent = `BEST ${pad(Math.max(best, current.score), 5)}`
  }

  function buildTouch(entry: CatalogEntry): void {
    touch.replaceChildren()
    const controls = entry.meta.controls
    const dpad = dpadActions(controls.dpad)
    if (dpad.length > 0) {
      const pad = el('div', 'arcade-dpad')
      const label: Record<string, string> = { up: '▲', down: '▼', left: '◀', right: '▶' }
      for (const action of dpad) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `arcade-pad arcade-pad--${action}`
        button.setAttribute('aria-label', action)
        button.textContent = label[action] ?? action
        bindTouchButton(button, action)
        pad.append(button)
      }
      touch.append(pad)
    }
    const buttons = controls.buttons ?? []
    if (buttons.length > 0) {
      const row = el('div', 'arcade-buttons')
      for (const spec of buttons) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'arcade-action'
        button.textContent = spec.label
        bindTouchButton(button, spec.action)
        row.append(button)
      }
      touch.append(row)
    }
  }

  function pressAction(action: string): void {
    const current = session
    if (!current) return
    pressed.forEach((held) => {
      if (held !== action) current.instance.onKey?.(held, false)
    })
    pressed = new Set([action])
    current.instance.onKey?.(action, true)
  }

  function releaseAction(action: string): void {
    const current = session
    if (!current || !pressed.has(action)) return
    pressed.delete(action)
    current.instance.onKey?.(action, false)
  }

  function bindTouchButton(button: HTMLButtonElement, action: string): void {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      sfx.unlock()
      pressAction(action)
    })
    const release = (event: Event): void => {
      event.preventDefault()
      releaseAction(action)
    }
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
    button.addEventListener('pointerleave', release)
  }

  function handleScore(value: number): void {
    const current = session
    if (!current) return
    current.score = value
    updateHud()
  }

  function handleGameOver(value: number): void {
    const current = session
    if (!current) return
    current.dead = true
    current.loop.stop()
    state = 'over'
    const meta = current.entry.meta
    const previous = data.best[meta.id] ?? 0
    const isRecord = value > previous
    if (isRecord) data.best[meta.id] = value
    data.plays += 1
    void saveData(gf, data)
    updateTiles()
    updateHud()
    sfx.suspend()
    showOverlay('over', isRecord)
    if (isRecord && value > 0) gf.ui.toast(`New best in ${meta.name}!`, { variant: 'ok' })
  }

  async function beginSession(entry: CatalogEntry): Promise<void> {
    teardownSession()
    const create = await entry.load()
    const hooks: GameHooks = {
      audio: sfx,
      best: data.best[entry.meta.id] ?? 0,
      setScore: handleScore,
      gameOver: handleGameOver,
      requestPause: pauseGame,
    }
    const instance = create(hooks)
    const loop = createLoop(
      (dt) => session?.instance.update(dt),
      () => {
        const current = session
        if (!current || !ctx) return
        ctx.clearRect(0, 0, current.size.width, current.size.height)
        current.instance.render(ctx, current.size.width, current.size.height)
      },
    )
    session = {
      entry,
      instance,
      loop,
      score: 0,
      dead: false,
      size: { width: 1, height: 1 },
    }
    hudTitle.replaceChildren(iconNode(entry.meta.icon, '1.2em'))
    const titleText = el('span')
    titleText.textContent = entry.meta.name
    hudTitle.append(titleText)
    buildTouch(entry)
    state = 'ready'
    gameView.hidden = false
    menu.hidden = true
    stopResize?.()
    stopResize = observeResize(stage, fit)
    fit()
    updateHud()
    showOverlay('ready')
  }

  function teardownSession(): void {
    if (session) {
      session.loop.stop()
      session.instance.destroy?.()
      session = null
    }
    stopResize?.()
    stopResize = null
    pressed = new Set()
    swipeStart = null
  }

  function startRound(): void {
    if (!session || state !== 'ready') return
    state = 'playing'
    hideOverlay()
    sfx.unlock()
    sfx.resume()
    session.loop.start()
  }

  function pauseGame(): void {
    if (!session || state !== 'playing') return
    state = 'paused'
    session.loop.pause()
    sfx.suspend()
    showOverlay('paused')
  }

  function resumeGame(): void {
    if (!session || state !== 'paused') return
    state = 'playing'
    hideOverlay()
    sfx.resume()
    session.loop.resume()
  }

  function togglePause(): void {
    if (state === 'paused') resumeGame()
    else pauseGame()
  }

  function closeGame(): void {
    teardownSession()
    menu.hidden = false
    gameView.hidden = true
    state = 'ready'
    updateTiles()
  }

  function openSettings(): void {
    const modal = el('gf-modal')
    modal.setAttribute('title', 'Arcade settings')
    const body = el('div', 'arcade-settings')

    const soundRow = el('label', 'arcade-setting')
    const soundText = el('span')
    soundText.textContent = 'Sound effects'
    const soundSwitch = el('gf-switch')
    if (!data.settings.muted) soundSwitch.setAttribute('checked', '')
    soundSwitch.addEventListener('gf-change', (event) => {
      const detail = (event as CustomEvent<{ checked: boolean }>).detail
      data.settings.muted = !detail.checked
      sfx.setMuted(data.settings.muted)
      void saveData(gf, data)
    })
    soundRow.append(soundText, soundSwitch)

    const total = Object.values(data.best).reduce((sum, value) => sum + value, 0)
    const info = el('p', 'arcade-settings__info')
    info.textContent = `${data.plays} games played · ${total} total points`

    const reset = el('gf-button')
    reset.setAttribute('slot', 'footer')
    reset.setAttribute('variant', 'danger')
    reset.textContent = 'Reset scores'
    reset.addEventListener('click', () => {
      void (async () => {
        const ok = await gf.ui.confirm('Reset all high scores?', { title: 'Reset scores', danger: true })
        if (!ok) return
        data.best = {}
        data.plays = 0
        await saveData(gf, data)
        updateTiles()
        modal.close()
        modal.remove()
        gf.ui.toast('Scores reset', { variant: 'danger' })
      })()
    })

    const close = el('gf-button')
    close.setAttribute('slot', 'footer')
    close.textContent = 'Close'
    close.addEventListener('click', () => {
      modal.close()
      modal.remove()
    })

    body.append(soundRow, info)
    modal.append(body, reset, close)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
  }

  backButton.addEventListener('click', () => {
    if (state === 'playing' && session) {
      void (async () => {
        const ok = await gf.ui.confirm('Leave the current game?', { title: 'Quit game', danger: true })
        if (ok) closeGame()
      })()
      return
    }
    closeGame()
  })
  pauseButton.addEventListener('click', togglePause)

  overlay.addEventListener('pointerdown', (event) => {
    if (state === 'ready') {
      event.preventDefault()
      startRound()
    }
  })

  canvas.addEventListener('pointerdown', (event) => {
    sfx.unlock()
    if (state !== 'playing' || !session) return
    event.preventDefault()
    canvas.setPointerCapture?.(event.pointerId)
    swipeStart = { x: event.clientX, y: event.clientY }
    forwardPointer(event, 'down')
  })
  canvas.addEventListener('pointermove', (event) => {
    if (state !== 'playing') return
    forwardPointer(event, 'move')
  })
  const endPointer = (event: PointerEvent): void => {
    const current = session
    if (state !== 'playing' || !current) {
      swipeStart = null
      return
    }
    forwardPointer(event, 'up')
    if (swipeStart && current.entry.meta.controls.swipe) {
      const swipe = detectSwipe(swipeStart.x, swipeStart.y, event.clientX, event.clientY)
      if (swipe) {
        current.instance.onKey?.(swipe.action, true)
        current.instance.onKey?.(swipe.action, false)
      }
    }
    swipeStart = null
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)

  window.addEventListener('keydown', (event) => {
    sfx.unlock()
    if (!session) return
    if (state === 'ready') {
      if (KEY_ACTIONS[event.code] || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        startRound()
      }
      return
    }
    if (state === 'over') {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        const current = session
        if (current) void beginSession(current.entry).then(startRound)
      }
      return
    }
    if (state === 'paused') {
      if (PAUSE_KEYS.has(event.code) || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        resumeGame()
      }
      return
    }
    if (PAUSE_KEYS.has(event.code)) {
      event.preventDefault()
      togglePause()
      return
    }
    const action = KEY_ACTIONS[event.code]
    if (!action) return
    event.preventDefault()
    if (pressed.has(action)) return
    pressed.add(action)
    session.instance.onKey?.(action, true)
  })

  window.addEventListener('keyup', (event) => {
    const action = KEY_ACTIONS[event.code]
    if (!action || !session || !pressed.has(action)) return
    pressed.delete(action)
    session.instance.onKey?.(action, false)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame()
  })
  window.addEventListener('blur', () => {
    if (state === 'playing') pauseGame()
  })

  gf.on('profileChanged', () => {
    void (async () => {
      closeGame()
      data = normalizeData(await gf.storage.get<unknown>(STORAGE_KEY))
      sfx.setMuted(data.settings.muted)
      updateTiles()
    })()
  })

  updateTiles()
}

void start()
