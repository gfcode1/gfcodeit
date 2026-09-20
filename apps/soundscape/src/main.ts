import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import { categories, getSound, type Category, type SoundDef } from './catalog'
import { SoundEngine } from './engine'

const ACTIVE_KEY = 'active'
const VOLUMES_KEY = 'volumes'
const MASTER_KEY = 'master'
const DEFAULT_VOLUME = 0.7

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

function iconNode(codepoint: string, size = '20px'): HTMLElement {
  const node = el('gf-icon')
  node.setAttribute('codepoint', codepoint)
  node.setAttribute('size', size)
  return node
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  let profile = await gf.profile.getCurrent()
  const storedActive = (await gf.storage.get<string[]>(ACTIVE_KEY)) ?? []
  const storedVolumes = (await gf.storage.get<Record<string, number>>(VOLUMES_KEY)) ?? {}
  const storedMaster = (await gf.storage.get<number>(MASTER_KEY)) ?? 0.8

  const volumes = new Map<string, number>()
  for (const id of storedActive) {
    if (getSound(id)) volumes.set(id, storedVolumes[id] ?? DEFAULT_VOLUME)
  }

  let query = ''
  let categoryFilter = 'all'

  // ---- static shell -------------------------------------------------------
  const header = el('gf-page-header')
  header.setAttribute('title', 'Soundscape')

  const toolbar = el('div', 'sound-toolbar')
  const search = el('gf-input')
  search.setAttribute('placeholder', 'Search sounds…')
  search.className = 'search'
  toolbar.append(search)

  const filterBar = el('div', 'filter-bar')
  const content = el('div', 'sound-content')

  const mixer = el('div', 'mixer')
  const playButton = el('gf-button')
  playButton.setAttribute('variant', 'primary')
  playButton.className = 'mixer__play'
  playButton.textContent = 'Play'

  const mixerCount = el('div', 'mixer__count')
  const masterWrap = el('div', 'mixer__master')
  const masterLabel = el('span', 'mixer__master-label')
  masterLabel.textContent = 'Master'
  const masterSlider = el('gf-slider')
  masterSlider.setAttribute('min', '0')
  masterSlider.setAttribute('max', '100')
  masterSlider.setAttribute('value', String(Math.round(storedMaster * 100)))
  const masterPct = el('span', 'mixer__pct')
  masterPct.textContent = `${Math.round(storedMaster * 100)}%`
  masterWrap.append(masterLabel, masterSlider, masterPct)

  const clearButton = el('gf-button')
  clearButton.setAttribute('size', 'sm')
  clearButton.textContent = 'Clear'

  mixer.append(playButton, mixerCount, masterWrap, clearButton)
  root.append(header, toolbar, filterBar, content, mixer)

  const engine = new SoundEngine(updateMixer)
  engine.setMasterVolume(storedMaster)
  for (const [id, volume] of volumes) {
    const def = getSound(id)
    if (def) engine.add(def, volume)
  }

  // ---- persistence --------------------------------------------------------
  async function persist(): Promise<void> {
    const kept: Record<string, number> = {}
    for (const [id, volume] of volumes) kept[id] = volume
    await gf.storage.set(ACTIVE_KEY, [...volumes.keys()])
    await gf.storage.set(VOLUMES_KEY, kept)
    await gf.storage.set(MASTER_KEY, engine.masterVolume)
  }

  // ---- actions ------------------------------------------------------------
  function toggleSound(sound: SoundDef): void {
    if (volumes.has(sound.id)) {
      volumes.delete(sound.id)
      engine.remove(sound.id)
    } else {
      volumes.set(sound.id, DEFAULT_VOLUME)
      engine.add(sound, DEFAULT_VOLUME)
      if (engine.isPaused) engine.setPaused(false)
    }
    void persist()
    renderGrid()
    updateMixer()
  }

  function changeMaster(value: number): void {
    const level = Math.min(1, Math.max(0, value))
    engine.setMasterVolume(level)
    masterPct.textContent = `${Math.round(level * 100)}%`
  }

  // ---- rendering ----------------------------------------------------------
  function updateMixer(): void {
    const count = engine.count
    mixerCount.textContent = count === 1 ? '1 sound' : `${count} sounds`
    playButton.textContent = engine.isPaused ? 'Play' : 'Pause'
    playButton.toggleAttribute('disabled', count === 0)
    mixer.dataset.state = count === 0 ? 'idle' : engine.isPaused ? 'paused' : 'playing'
    header.setAttribute('subtitle', `${profile.name} · ${count} active`)
  }

  function renderFilterBar(): void {
    filterBar.innerHTML = ''
    const items = [{ id: 'all', title: 'All' }, ...categories.map((c) => ({ id: c.id, title: c.title }))]
    for (const item of items) {
      const chip = el('gf-chip')
      if (item.id === categoryFilter) chip.setAttribute('active', '')
      chip.textContent = item.title
      chip.addEventListener('click', () => {
        categoryFilter = item.id
        renderFilterBar()
        renderGrid()
      })
      filterBar.append(chip)
    }
  }

  function visibleCategories(): Category[] {
    const q = query.trim().toLowerCase()
    return categories
      .filter((category) => categoryFilter === 'all' || category.id === categoryFilter)
      .map((category) => ({
        ...category,
        sounds: category.sounds.filter((sound) => !q || sound.label.toLowerCase().includes(q)),
      }))
      .filter((category) => category.sounds.length > 0)
  }

  function soundCard(sound: SoundDef, catIcon: string): HTMLElement {
    const card = el('div', 'sound-card')
    const active = volumes.has(sound.id)
    if (active) card.classList.add('is-active')

    const top = el('div', 'sound-card__top')
    const label = el('div', 'sound-card__label')
    label.textContent = sound.label
    top.append(iconNode(catIcon, '22px'), label)
    card.append(top)

    if (active) {
      const volume = volumes.get(sound.id) ?? DEFAULT_VOLUME
      const foot = el('div', 'sound-card__foot')
      const slider = el('gf-slider')
      slider.setAttribute('min', '0')
      slider.setAttribute('max', '100')
      slider.setAttribute('value', String(Math.round(volume * 100)))
      const pct = el('span', 'sound-card__pct')
      pct.textContent = `${Math.round(volume * 100)}%`
      slider.addEventListener('click', (event) => event.stopPropagation())
      slider.addEventListener('gf-input', (event) => {
        const value = (event as CustomEvent<{ value: number }>).detail.value / 100
        volumes.set(sound.id, value)
        pct.textContent = `${Math.round(value * 100)}%`
        engine.setVolume(sound.id, value)
      })
      slider.addEventListener('gf-change', () => void persist())
      foot.append(slider, pct)
      card.append(foot)
    }

    card.addEventListener('click', () => toggleSound(sound))
    return card
  }

  function renderGrid(): void {
    content.innerHTML = ''
    const visible = visibleCategories()
    if (visible.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F50D')
      empty.setAttribute('title', 'No sounds')
      empty.setAttribute('text', 'Try another search or category.')
      content.append(empty)
      return
    }
    for (const category of visible) {
      const section = el('section', 'sound-section')
      const head = el('div', 'sound-section__head')
      head.append(iconNode(category.icon, '18px'))
      const title = el('span', 'sound-section__title')
      title.textContent = category.title
      head.append(title)
      const grid = el('div', 'sound-grid')
      for (const sound of category.sounds) grid.append(soundCard(sound, category.icon))
      section.append(head, grid)
      content.append(section)
    }
  }

  // ---- events -------------------------------------------------------------
  search.addEventListener('gf-input', (event) => {
    query = (event as CustomEvent<{ value: string }>).detail.value
    renderGrid()
  })

  playButton.addEventListener('click', () => {
    if (engine.count === 0) return
    engine.setPaused(!engine.isPaused)
  })

  masterSlider.addEventListener('gf-input', (event) => {
    changeMaster((event as CustomEvent<{ value: number }>).detail.value / 100)
  })
  masterSlider.addEventListener('gf-change', () => void persist())

  clearButton.addEventListener('click', () => {
    engine.clear()
    volumes.clear()
    void persist()
    renderGrid()
    updateMixer()
  })

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, gf-input, gf-textarea, gf-select')) return
    if (event.code === 'Space') {
      event.preventDefault()
      if (engine.count > 0) engine.setPaused(!engine.isPaused)
    }
  })

  window.addEventListener('pagehide', () => engine.dispose())

  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      const nextActive = (await gf.storage.get<string[]>(ACTIVE_KEY)) ?? []
      const nextVolumes = (await gf.storage.get<Record<string, number>>(VOLUMES_KEY)) ?? {}
      const nextMaster = (await gf.storage.get<number>(MASTER_KEY)) ?? engine.masterVolume
      engine.clear()
      volumes.clear()
      for (const id of nextActive) {
        const def = getSound(id)
        if (!def) continue
        const volume = nextVolumes[id] ?? DEFAULT_VOLUME
        volumes.set(id, volume)
        engine.add(def, volume)
      }
      engine.setMasterVolume(nextMaster)
      changeMaster(nextMaster)
      renderGrid()
      updateMixer()
      gf.ui.toast('Profile changed')
    })()
  })

  renderFilterBar()
  renderGrid()
  updateMixer()
  await gf.storage.init()
}

void start()
