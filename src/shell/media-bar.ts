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

  const volume = document.createElement('gf-slider')
  volume.className = 'media-bar__volume'
  volume.setAttribute('min', '0')
  volume.setAttribute('max', '100')

  const toggle = iconButton('25B6', 'Play')
  const stop = iconButton('23F9', 'Stop')
  const open = iconButton('1F517', 'Open app')

  controls.append(volume, toggle.button, stop.button, open.button)
  el.append(art, info, controls)

  let owner: string | null = null
  let artKey = ''

  volume.addEventListener('gf-input', (event) => {
    callbacks.onVolume((event as CustomEvent<{ value: number }>).detail.value / 100)
  })
  toggle.button.addEventListener('click', () => callbacks.onToggle())
  stop.button.addEventListener('click', () => callbacks.onStop())
  open.button.addEventListener('click', () => {
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

    if (!volume.contains(document.activeElement)) {
      volume.setAttribute('value', String(Math.round(next.master * 100)))
    }
  }

  return { el, update }
}
