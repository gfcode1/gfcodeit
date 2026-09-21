import {
  BRIDGE_PROTOCOL_VERSION,
  BridgeError,
  FRAMEWORK_SDK_VERSION,
  RPC_TIMEOUT_MS,
  rangeSatisfies,
  type BridgeMessage,
  type HelloMessage,
  type RpcRequest,
  type RpcResult,
  type WelcomeMessage,
} from './bridge-protocol'
import type { AppManifest, BridgeMethod, Permission, Profile, ThemeMode } from './types'

/** Permissions the shell re-checks for each bridged method. */
const RPC_PERMISSIONS: Partial<Record<BridgeMethod, Permission>> = {
  'ui.toast': 'ui.toast',
  'ui.modal': 'ui.modal',
  'ui.confirm': 'ui.confirm',
  'ui.badge': 'notifications',
  'shell.navigate': 'navigation',
  'shell.home': 'navigation',
  'theme.set': 'theme.write',
  'scheduler.schedule': 'scheduler',
  'scheduler.cancel': 'scheduler',
  'scheduler.snooze': 'scheduler',
  'scheduler.list': 'scheduler',
  'scheduler.clear': 'scheduler',
  'media.play': 'media',
  'media.load': 'media',
  'media.pause': 'media',
  'media.resume': 'media',
  'media.remove': 'media',
  'media.clear': 'media',
  'media.setVolume': 'media',
  'media.setMasterVolume': 'media',
  'media.setPaused': 'media',
  'media.setMetadata': 'media',
  'media.list': 'media',
  'media.setSleepTimer': 'media',
}

export interface ThemeState {
  mode: ThemeMode
  accent: string
  resolved: 'light' | 'dark'
}

export interface HostOptions {
  appId: string
  token: string
  iframe: HTMLIFrameElement
  manifest?: AppManifest
  getTheme: () => ThemeState
  getProfile: () => Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'>
  handlers: Partial<Record<BridgeMethod, (params: unknown) => unknown | Promise<unknown>>>
  onEvent?: (channel: string, payload: unknown) => void
  onConnected?: () => void
  /** Fatal errors (protocol mismatch, unusable bridge) — the app cannot continue. */
  onError?: (error: { code: string; message: string }) => void
  /** Non-fatal RPC failures — logged, the app keeps running. */
  onRpcError?: (error: { code: string; message: string }) => void
}

/** Shell side of the bridge: performs the handshake and drives RPC/events. */
export class BridgeHost {
  private port: MessagePort | null = null
  private messageListener: ((event: MessageEvent) => void) | null = null
  private connected = false

  constructor(private readonly options: HostOptions) {}

  attach(): void {
    const listener = (event: MessageEvent) => {
      const data = event.data as HelloMessage | undefined
      if (!data || data.t !== 'gf:hello') return
      if (event.source !== this.options.iframe.contentWindow) return
      if (event.origin !== window.location.origin) return
      if (data.token !== this.options.token) return
      this.accept(event, data)
    }
    this.messageListener = listener
    window.addEventListener('message', listener)
  }

  private accept(event: MessageEvent, hello: HelloMessage): void {
    if (hello.v !== BRIDGE_PROTOCOL_VERSION) {
      this.reject(event, 'E_SDK', `Incompatible SDK version ${hello.v}`)
      return
    }
    if (hello.sdk && !rangeSatisfies(FRAMEWORK_SDK_VERSION, hello.sdk)) {
      this.reject(event, 'E_SDK', `App requires SDK ${hello.sdk}, framework is ${FRAMEWORK_SDK_VERSION}`)
      return
    }
    const channel = new MessageChannel()
    this.port = channel.port1
    this.port.onmessage = (messageEvent) => this.receive(messageEvent.data as BridgeMessage)
    this.port.start()

    const welcome: WelcomeMessage = {
      t: 'gf:welcome',
      v: BRIDGE_PROTOCOL_VERSION,
      token: this.options.token,
      theme: this.options.getTheme(),
      profile: this.options.getProfile(),
    }
    ;(event.source as Window).postMessage(welcome, window.location.origin, [channel.port2])
    this.connected = true
    this.options.onConnected?.()
  }

  private reject(event: MessageEvent, code: string, message: string): void {
    ;(event.source as Window | null)?.postMessage({ t: 'gf:reject', code, message }, window.location.origin)
    this.options.onError?.({ code, message })
  }

  private async receive(message: BridgeMessage): Promise<void> {
    if (!message) return
    if (message.k === 'rpc') {
      await this.handleRpc(message)
    } else if (message.k === 'ev') {
      this.options.onEvent?.(message.channel, message.payload)
    }
  }

  private async handleRpc(message: RpcRequest): Promise<void> {
    const result: RpcResult = { k: 'rpc:result', id: message.id, ok: false }
    const required = RPC_PERMISSIONS[message.method]
    const granted = this.options.manifest?.permissions ?? []
    if (required && !granted.includes(required)) {
      result.error = { code: 'E_PERMISSION', message: `Permission "${required}" required for ${message.method}` }
      this.options.onRpcError?.(result.error)
      this.port?.postMessage(result)
      return
    }
    const handler = this.options.handlers[message.method]
    if (!handler) {
      result.error = { code: 'E_METHOD', message: `Unknown method ${message.method}` }
    } else {
      try {
        result.result = await handler(message.params)
        result.ok = true
      } catch (error) {
        const err = error as Error & { code?: string }
        result.error = { code: err.code ?? 'E_APP', message: err.message }
        this.options.onRpcError?.(result.error)
      }
    }
    this.port?.postMessage(result)
  }

  emitEvent(channel: string, payload: unknown): void {
    if (!this.port) return
    this.port.postMessage({ k: 'ev', channel, payload })
  }

  isConnected(): boolean {
    return this.connected
  }

  destroy(): void {
    if (this.messageListener) window.removeEventListener('message', this.messageListener)
    this.port?.close()
    this.port = null
    this.connected = false
  }
}

/** Removes `?gf-token=` once consumed so it cannot leak via referrers or history. */
function stripTokenFromUrl(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('gf-token')) return
  url.searchParams.delete('gf-token')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(null, '', next)
}

export interface ClientOptions {
  appId: string
  sdk: string
  manifest: AppManifest
  token: string
  onEvent?: (channel: string, payload: unknown) => void
}

/** App side of the bridge. Falls back to standalone mode when not embedded. */
export class BridgeClient {
  private port: MessagePort | null = null
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private readonly options: ClientOptions
  private welcome: WelcomeMessage | null = null

  constructor(options: ClientOptions) {
    this.options = options
  }

  get embedded(): boolean {
    return window.parent !== window
  }

  get welcomeMessage(): WelcomeMessage | null {
    return this.welcome
  }

  connect(): Promise<WelcomeMessage> {
    if (!this.embedded) return Promise.reject(new BridgeError({ code: 'E_STANDALONE', message: 'Not embedded' }))
    return new Promise<WelcomeMessage>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new BridgeError({ code: 'E_HANDSHAKE', message: 'Shell handshake timed out' }))
      }, RPC_TIMEOUT_MS)

      const onMessage = (event: MessageEvent) => {
        // Only the shell (our parent) may drive the handshake. Without this a
        // sibling same-origin iframe could post a welcome + port and hijack RPC.
        if (event.source !== window.parent) return
        if (event.origin !== window.location.origin) return
        const data = event.data as WelcomeMessage | { t: 'gf:reject'; code: string; message: string }
        if (!data || typeof data !== 'object') return
        if (data.t === 'gf:reject') {
          cleanup()
          reject(new BridgeError({ code: data.code, message: data.message }))
          return
        }
        if (data.t !== 'gf:welcome') return
        // The welcome must echo the token we sent in the hello.
        if (data.token !== this.options.token) return
        const port = event.ports[0]
        if (!port) return
        cleanup()
        this.port = port
        this.port.onmessage = (messageEvent) => this.receive(messageEvent.data as BridgeMessage)
        this.port.start()
        this.welcome = data
        stripTokenFromUrl()
        resolve(data)
      }

      const cleanup = () => {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
      }

      window.addEventListener('message', onMessage)
      const hello: HelloMessage = {
        t: 'gf:hello',
        v: BRIDGE_PROTOCOL_VERSION,
        appId: this.options.appId,
        sdk: this.options.sdk,
        manifest: this.options.manifest,
        token: this.options.token,
      }
      window.parent.postMessage(hello, window.location.origin)
    })
  }

  private receive(message: BridgeMessage): void {
    if (!message) return
    if (message.k === 'rpc:result') {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      if (message.ok) entry.resolve(message.result)
      else entry.reject(new BridgeError(message.error ?? { code: 'E_RPC', message: 'RPC failed' }))
    } else if (message.k === 'ev') {
      this.options.onEvent?.(message.channel, message.payload)
    }
  }

  call<T = unknown>(method: BridgeMethod, params?: unknown): Promise<T> {
    if (!this.port) return Promise.reject(new BridgeError({ code: 'E_DISCONNECTED', message: 'Bridge not connected' }))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new BridgeError({ code: 'E_TIMEOUT', message: `RPC timeout: ${method}` }))
      }, RPC_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timer)
          resolve(value as T)
        },
        reject: (error) => {
          window.clearTimeout(timer)
          reject(error)
        },
      })
      this.port!.postMessage({ k: 'rpc', id, method, params } satisfies RpcRequest)
    })
  }

  emitEvent(channel: string, payload: unknown): void {
    this.port?.postMessage({ k: 'ev', channel, payload })
  }
}
