import type { AppManifest, MediaState } from '../core/types'

export interface MediaBarCallbacks {
  onOpenApp(appId: string): void
  onToggle(): void
  onStop(): void
  onVolume(volume: number): void
}

export interface MediaBar {
  el: HTMLElement
  update(state: MediaState, app: AppManifest | undefined): void
}

function iconButton(codepoint: string, label: string): { button: HTMLButtonElement; icon: HTMLElement } {
  const button = document.createElement('button')
  button.className = 'icon-btn'
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.title = label
  const icon = document.createElement('gf-icon')
  icon.setAttribute('codepoint', codepoint)
  icon.setAttribute('size', '20px')
  button.append(icon)
  return { button, icon }
}

function volumeSlider(className: string, callbacks: MediaBarCallbacks): HTMLElement {
  const slider = document.createElement('gf-slider')
  slider.className = className
  slider.setAttribute('min', '0')
  slider.setAttribute('max', '100')
  slider.addEventListener('gf-input', (event) => {
    callbacks.onVolume((event as CustomEvent<{ value: number }>).detail.value / 100)
  })
  return slider
}

export function createMediaBar(host: HTMLElement, callbacks: MediaBarCallbacks): MediaBar {
  const el = host
  el.classList.add('media-bar')
  el.hidden = true

  const art = document.createElement('div')
  art.className = 'media-bar__art'

  const info = document.createElement('div')
  info.className = 'media-bar__info'
  const title = document.createElement('div')
  title.className = 'media-bar__title'
  const meta = document.createElement('div')
  meta.className = 'media-bar__meta'
  info.append(title, meta)

  const controls = document.createElement('div')
  controls.className = 'media-bar__controls'

  const volume = volumeSlider('media-bar__volume', callbacks)

  const toggle = iconButton('25B6', 'Play')
  const stop = iconButton('23F9', 'Stop')
  const open = iconButton('1F517', 'Open app')
  open.button.classList.add('media-bar__open')

  controls.append(volume, toggle.button, stop.button, open.button)

  // Compact-mode overflow: on narrow screens the volume and open controls move
  // into an upward-opening menu so the single bar still fits.
  const more = document.createElement('gf-menu')
  more.className = 'media-bar__more'
  more.setAttribute('placement', 'up')
  // No OpenMoji glyph for the vertical ellipsis, so use the character directly.
  const moreTrigger = document.createElement('button')
  moreTrigger.className = 'icon-btn'
  moreTrigger.type = 'button'
  moreTrigger.setAttribute('aria-label', 'More controls')
  moreTrigger.title = 'More controls'
  moreTrigger.textContent = '⋯'
  moreTrigger.slot = 'trigger'
  const morePanel = document.createElement('div')
  morePanel.slot = 'panel'
  const menuLabel = document.createElement('span')
  menuLabel.className = 'media-bar__menu-label gf-label'
  menuLabel.textContent = 'Volume'
  const menuVolume = volumeSlider('media-bar__volume-menu', callbacks)
  const menuOpen = document.createElement('button')
  menuOpen.type = 'button'
  menuOpen.setAttribute('data-menu-item', '')
  menuOpen.textContent = 'Open app'
  morePanel.append(menuLabel, menuVolume, menuOpen)
  more.append(moreTrigger, morePanel)

  el.append(art, info, controls, more)

  let owner: string | null = null
  let artKey = ''

  toggle.button.addEventListener('click', () => callbacks.onToggle())
  stop.button.addEventListener('click', () => callbacks.onStop())
  open.button.addEventListener('click', () => {
    if (owner) callbacks.onOpenApp(owner)
  })
  menuOpen.addEventListener('click', () => {
    if (owner) callbacks.onOpenApp(owner)
  })

  function update(next: MediaState, app: AppManifest | undefined): void {
    owner = next.owner
    if (!next.owner || next.sources.length === 0) {
      el.hidden = true
      return
    }
    el.hidden = false
    el.dataset.status = next.status

    const primary = next.sources.find((source) => source.title) ?? next.sources[0]!
    title.textContent = primary.title ?? app?.name ?? next.owner

    if (next.status === 'error') {
      meta.textContent = primary.error ?? 'Playback error'
    } else if (next.status === 'loading') {
      meta.textContent = 'Connecting…'
    } else if (next.sources.length > 1) {
      meta.textContent = `${app?.name ?? next.owner} · ${next.sources.length} sounds`
    } else {
      meta.textContent = app?.name ?? next.owner
    }

    const paused = next.paused || next.status === 'paused' || next.status === 'idle'
    toggle.icon.setAttribute('codepoint', paused ? '25B6' : '23F8')
    const toggleLabel = paused ? 'Play' : 'Pause'
    toggle.button.setAttribute('aria-label', toggleLabel)
    toggle.button.title = toggleLabel

    const key = primary.artwork ?? app?.icon ?? ''
    if (key !== artKey) {
      artKey = key
      art.innerHTML = ''
      if (primary.artwork) {
        const img = document.createElement('img')
        img.alt = ''
        img.referrerPolicy = 'no-referrer'
        img.src = primary.artwork
        art.append(img)
      } else {
        const icon = document.createElement('gf-icon')
        icon.setAttribute('codepoint', app?.icon ?? '1F3B5')
        icon.setAttribute('size', '20px')
        art.append(icon)
      }
    }

    const percent = String(Math.round(next.master * 100))
    for (const slider of [volume, menuVolume]) {
      if (!slider.contains(document.activeElement)) slider.setAttribute('value', percent)
    }
  }

  return { el, update }
}
