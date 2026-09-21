import { BridgeHost, type ThemeState } from '../core/bridge'
import type { AppManifest, BridgeMethod, Profile, ScheduleItem } from '../core/types'
import { BACKGROUND_TIMEOUT_MS, HANDSHAKE_TIMEOUT_MS, memoryPressure } from '../core/lifecycle'

export interface AppHostDeps {
  getTheme: () => ThemeState
  getProfile: () => Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'>
  handlers: Partial<Record<BridgeMethod, (params: unknown) => unknown | Promise<unknown>>>
  onEvent?: (channel: string, payload: unknown) => void
  onError?: (appId: string, error: { code: string; message: string }) => void
  onRpcError?: (appId: string, error: { code: string; message: string }) => void
}

const BASE = import.meta.env.BASE_URL

export class AppHost {
  private iframe: HTMLIFrameElement | null = null
  private bridge: BridgeHost | null = null
  private hideTimer: number | null = null
  private handshakeTimer: number | null = null
  private currentId: string | null = null
  private readonly loading: HTMLElement
  private readonly error: HTMLElement

  constructor(
    private readonly container: HTMLElement,
    private readonly deps: AppHostDeps,
  ) {
    this.loading = document.createElement('div')
    this.loading.className = 'app-loading'
    this.loading.innerHTML = '<gf-spinner></gf-spinner><span>Loading app…</span>'

    this.error = document.createElement('div')
    this.error.className = 'app-error'
    this.error.hidden = true
  }

  get appId(): string | null {
    return this.currentId
  }

  mount(app: AppManifest): void {
    if (this.currentId === app.id && this.iframe) {
      this.show()
      return
    }
    this.unmount()

    this.loading.hidden = false
    this.error.hidden = true
    this.error.innerHTML = ''

    const token = crypto.randomUUID()
    const iframe = document.createElement('iframe')
    iframe.className = 'app-frame'
    iframe.title = app.name
    // Do not leak the frame URL (which carries the bridge token) as a referrer,
    // and deny powerful features apps do not need (camera, mic, geolocation…).
    iframe.referrerPolicy = 'no-referrer'
    iframe.setAttribute('allow', 'clipboard-write; fullscreen; autoplay')
    iframe.src = `${BASE}apps/${app.id}/${app.entry}?gf-token=${token}`
    iframe.hidden = true
    this.iframe = iframe
    this.currentId = app.id

    this.container.append(this.loading, this.error, iframe)
    this.show()

    const bridge = new BridgeHost({
      appId: app.id,
      token,
      iframe,
      manifest: app,
      getTheme: this.deps.getTheme,
      getProfile: this.deps.getProfile,
      handlers: this.deps.handlers,
      onEvent: this.deps.onEvent,
      onConnected: () => {
        if (this.bridge !== bridge) return
        iframe.hidden = false
        this.loading.hidden = true
      },
      onError: (error) => {
        if (this.bridge !== bridge) return
        this.deps.onError?.(app.id, error)
        this.showError(error)
      },
      onRpcError: (error) => this.deps.onRpcError?.(app.id, error),
    })
    this.bridge = bridge
    bridge.attach()

    iframe.addEventListener('error', () => {
      if (this.bridge !== bridge) return
      this.showError({ code: 'E_LOAD', message: `Failed to load ${app.name}` })
    })

    this.handshakeTimer = window.setTimeout(() => {
      if (this.bridge !== bridge) return
      if (!bridge.isConnected()) {
        this.showError({ code: 'E_HANDSHAKE', message: `${app.name} did not connect to the shell.` })
      }
    }, HANDSHAKE_TIMEOUT_MS)
  }

  private showError(error: { code: string; message: string }): void {
    this.loading.hidden = true
    if (this.iframe) this.iframe.hidden = true
    this.error.hidden = false
    this.error.innerHTML = ''
    const title = document.createElement('div')
    title.className = 'app-error__title'
    title.textContent = 'App error'
    const message = document.createElement('div')
    message.className = 'app-error__message'
    message.textContent = `${error.code}: ${error.message}`
    const retry = document.createElement('gf-button')
    retry.setAttribute('variant', 'primary')
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => {
      this.unmount()
      location.reload()
    })
    this.error.append(title, message, retry)
  }

  show(): void {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (this.iframe) this.iframe.hidden = false
    this.bridge?.emitEvent('visibilityChanged', { visible: true })
  }

  hide(): void {
    if (this.iframe) this.iframe.hidden = true
    this.bridge?.emitEvent('visibilityChanged', { visible: false })
    if (this.hideTimer) window.clearTimeout(this.hideTimer)
    // Free memory immediately under pressure instead of waiting for the timeout.
    if (memoryPressure()) {
      this.unmount()
      return
    }
    this.hideTimer = window.setTimeout(() => this.unmount(), BACKGROUND_TIMEOUT_MS)
  }

  notifyTheme(): void {
    this.bridge?.emitEvent('themeChanged', this.deps.getTheme())
  }

  notifyProfile(): void {
    this.bridge?.emitEvent('profileChanged', this.deps.getProfile())
  }

  notifyScheduled(item: ScheduleItem): void {
    this.bridge?.emitEvent('scheduler:fired', item)
  }

  notifyMedia(state: unknown): void {
    this.bridge?.emitEvent('media:state', state)
  }

  emitMediaCommand(command: unknown): void {
    this.bridge?.emitEvent('media:command', command)
  }

  unmount(): void {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
    if (this.handshakeTimer) {
      window.clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    this.bridge?.destroy()
    this.bridge = null
    this.iframe?.remove()
    this.iframe = null
    this.loading.remove()
    this.error.remove()
    this.currentId = null
  }
}
