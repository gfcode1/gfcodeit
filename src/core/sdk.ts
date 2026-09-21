import { createStorage, type StorageHandle, type UpgradeFn } from './storage'
import { createCache, type GFCacheApi } from './cache'
import { createMediaHub, type MediaHub } from './media'
import { BridgeClient } from './bridge'
import { BridgeError, FRAMEWORK_SDK_VERSION } from './bridge-protocol'
import { bus } from './bus'
import { applyTheme, resolveTheme } from './theme'
import { colorIconUrl, iconUrl, loadIconIndex, setAssetBase as setIconsBase, type IconMeta } from './icons'
import { getCurrentProfile, listProfiles, updateProfile } from './profile'
import { createLocalScheduler } from './local-scheduler'
import { toast, type ToastOptions } from '../ui/overlay'
import type {
  AppManifest,
  MediaCommand,
  MediaSourceInit,
  MediaSourceState,
  MediaState,
  Permission,
  Profile,
  ScheduleDraft,
  ScheduleItem,
  StorageScope,
  ThemeMode,
} from './types'

export class PermissionDeniedError extends Error {
  readonly code = 'E_PERMISSION'
  constructor(permission: Permission, method: string) {
    super(`Permission "${permission}" required for ${method}`)
    this.name = 'PermissionDeniedError'
  }
}

export const SDK_VERSION = FRAMEWORK_SDK_VERSION

export interface GFStorageApi {
  readonly currentScope: StorageScope
  get: StorageHandle['get']
  set: StorageHandle['set']
  delete: StorageHandle['delete']
  keys: StorageHandle['keys']
  clear: StorageHandle['clear']
  onUpgrade(fn: UpgradeFn, scope?: StorageScope): void
  init: StorageHandle['init']
  scope(scope: StorageScope): StorageHandle
}

export interface GFMediaApi {
  /** Add or replace a source and start playing it (claims audio for this app). */
  play(id: string, source: MediaSourceInit): Promise<MediaSourceState>
  /** Add or replace a source without playing it. */
  load(id: string, source: MediaSourceInit): Promise<MediaSourceState>
  pause(id?: string): Promise<void>
  resume(id?: string): Promise<void>
  remove(id: string, fadeMs?: number): Promise<void>
  /** Remove every source owned by this app. */
  clear(): Promise<void>
  setVolume(id: string, volume: number, fadeMs?: number): Promise<void>
  setMasterVolume(volume: number, fadeMs?: number): Promise<void>
  setPaused(paused: boolean): Promise<void>
  setMetadata(id: string, meta: Partial<MediaSourceInit>): Promise<void>
  list(): Promise<MediaSourceState[]>
  setSleepTimer(ms: number | null): Promise<void>
  /** Fires whenever this app's media state changes (or it loses audio). */
  onState(handler: (state: MediaState) => void): () => void
  /** Media Session / global-player transport commands addressed to this app. */
  onCommand(handler: (command: MediaCommand) => void): () => void
}

export interface GFApi {
  version: string
  embedded: boolean
  appId: string
  manifest: AppManifest | null
  permissions: Set<Permission>
  profile: {
    getCurrent(): Promise<Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'>>
    list(): Promise<Profile[]>
    update(patch: Partial<Profile>): Promise<void>
  }
  storage: GFStorageApi
  cache: GFCacheApi
  theme: {
    get(): ThemeMode
    set(mode: ThemeMode): void
    resolved(): 'light' | 'dark'
  }
  ui: {
    toast(message: string, options?: ToastOptions): void
    confirm(message: string, options?: { title?: string; okLabel?: string; danger?: boolean }): Promise<boolean>
    modal(title: string, content: string): void
    badge(count: number): void
  }
  icons: {
    url(codepoint: string): string
    colorUrl(codepoint: string): string
    index(): Promise<IconMeta[]>
  }
  shell: {
    navigate(target: string): void
    home(): void
  }
  media: GFMediaApi
  scheduler: {
    schedule(draft: ScheduleDraft): Promise<ScheduleItem>
    cancel(id: string): Promise<boolean>
    snooze(id: string, ms?: number): Promise<boolean>
    list(): Promise<ScheduleItem[]>
    clear(): Promise<void>
    onFired(handler: (item: ScheduleItem) => void): () => void
  }
  bus: {
    on<T>(channel: string, handler: (payload: T) => void): () => void
    emit<T>(channel: string, payload: T): void
  }
  on<T>(channel: string, handler: (payload: T) => void): () => void
  setAssetBase(base: string): void
}

function detectAppId(): string {
  const match = window.location.pathname.match(/\/apps\/([^/]+)\//)
  return match?.[1] ?? 'unknown'
}

async function loadManifest(): Promise<AppManifest | null> {
  try {
    const response = await fetch(new URL('app.manifest.json', document.baseURI))
    if (!response.ok) return null
    return (await response.json()) as AppManifest
  } catch {
    return null
  }
}

export interface InitOptions {
  appId?: string
  manifest?: AppManifest | null
}

export async function initSDK(options: InitOptions = {}): Promise<GFApi> {
  const manifest = options.manifest ?? (await loadManifest())
  const appId = options.appId ?? manifest?.id ?? detectAppId()
  const permissions = new Set<Permission>(manifest?.permissions ?? ['storage', 'profile'])

  const scope: StorageScope = manifest?.storage?.scope ?? 'profile'
  const schemaVersion = manifest?.storage?.schemaVersion ?? 1
  const getProfileId = () => localStorage.getItem('gf:currentProfile') ?? 'default'
  const localScheduler = createLocalScheduler(appId, getProfileId)

  const handles = new Map<StorageScope, StorageHandle>()
  function handleFor(target: StorageScope): StorageHandle {
    let handle = handles.get(target)
    if (!handle) {
      handle = createStorage({ appId, scope: target, schemaVersion, getProfileId })
      handles.set(target, handle)
    }
    return handle
  }

  const primary = handleFor(scope)
  const storage: GFStorageApi = {
    currentScope: scope,
    get: (key, fallback) => primary.get(key, fallback),
    set: (key, value) => primary.set(key, value),
    delete: (key) => primary.delete(key),
    keys: () => primary.keys(),
    clear: () => primary.clear(),
    onUpgrade: (fn, target) => handleFor(target ?? scope).onUpgrade(fn),
    init: () => primary.init(),
    scope: handleFor,
  }
  // Shared scope so public API responses are reused across profiles; without
  // the storage permission the cache degrades to memory-only.
  const cache = createCache(permissions.has('storage') ? { storage: handleFor('shared') } : {})
  const mediaStateListeners = new Set<(state: MediaState) => void>()
  const mediaCommandListeners = new Set<(command: MediaCommand) => void>()
  // Standalone fallback: a hub local to this document, mirroring the shell one.
  let localMedia: MediaHub | null = null
  function getLocalMedia(): MediaHub {
    if (!localMedia) {
      localMedia = createMediaHub()
      localMedia.onState((state) => {
        for (const handler of mediaStateListeners) handler(state)
      })
      localMedia.onCommand((command) => {
        for (const handler of mediaCommandListeners) handler(command)
      })
    }
    return localMedia
  }
  const token = new URLSearchParams(window.location.search).get('gf-token') ?? ''
  let sessionProfile: Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'> | null = null
  const client = token
    ? new BridgeClient({
        appId,
        sdk: SDK_VERSION,
        manifest: manifest as AppManifest,
        token,
        onEvent: (channel, payload) => {
          if (channel === 'themeChanged') {
            const next = payload as { mode: ThemeMode; accent: string }
            themeMode = next.mode
            applyTheme(next.mode, next.accent)
          } else if (channel === 'profileChanged') {
            const next = payload as Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'>
            if (next && typeof next.id === 'string') {
              sessionProfile = { id: next.id, name: next.name, avatar: next.avatar, accent: next.accent }
            }
          } else if (channel === 'media:state') {
            for (const handler of mediaStateListeners) handler(payload as MediaState)
          } else if (channel === 'media:command') {
            for (const handler of mediaCommandListeners) handler(payload as MediaCommand)
          }
          bus.emit(channel, payload)
        },
      })
    : null

  let themeMode: ThemeMode = 'system'
  let embedded = false

  if (client && client.embedded) {
    try {
      const welcome = await client.connect()
      embedded = true
      themeMode = welcome.theme.mode
      sessionProfile = welcome.profile
      applyTheme(welcome.theme.mode, welcome.theme.accent)
    } catch {
      embedded = false
    }
  }

  if (!embedded) {
    const fallback = (localStorage.getItem('gf:theme') as ThemeMode | null) ?? 'system'
    applyTheme(fallback)
  }

  function require_(permission: Permission, method: string): void {
    if (!permissions.has(permission)) throw new PermissionDeniedError(permission, method)
  }

  const api: GFApi = {
    version: SDK_VERSION,
    get embedded() {
      return embedded
    },
    appId,
    manifest,
    permissions,
    profile: {
      async getCurrent() {
        if (embedded) require_('profile', 'profile.getCurrent')
        if (embedded && sessionProfile) {
          return { ...sessionProfile }
        }
        const full = await getCurrentProfile()
        return { id: full.id, name: full.name, avatar: full.avatar, accent: full.accent }
      },
      async list() {
        require_('profile', 'profile.list')
        return listProfiles()
      },
      async update(patch) {
        require_('profile', 'profile.update')
        const current = await getCurrentProfile()
        const next = await updateProfile(current.id, patch)
        if (sessionProfile && sessionProfile.id === next.id) {
          sessionProfile = { id: next.id, name: next.name, avatar: next.avatar, accent: next.accent }
        }
      },
    },
    storage,
    cache,
    theme: {
      get() {
        return themeMode
      },
      resolved() {
        return resolveTheme(themeMode)
      },
      set(mode: ThemeMode) {
        require_('theme.write', 'theme.set')
        themeMode = mode
        applyTheme(mode)
        if (embedded) void client?.call('theme.set', { mode }).catch(() => undefined)
      },
    },
    ui: {
      toast(message, opts) {
        if (embedded) {
          if (permissions.has('ui.toast')) {
            void client?.call('ui.toast', { message, ...opts }).catch(() => toast(message, opts))
            return
          }
        }
        toast(message, opts)
      },
      async confirm(message, opts) {
        require_('ui.confirm', 'ui.confirm')
        if (embedded) {
          const result = (await client!.call<{ ok: boolean }>('ui.confirm', { message, ...opts })) as { ok: boolean }
          return result.ok
        }
        return window.confirm(message)
      },
      modal(title, content) {
        if (embedded && permissions.has('ui.modal')) {
          void client?.call('ui.modal', { title, content })
          return
        }
        toast(`${title}: ${content}`)
      },
      badge(count) {
        if (!embedded) return
        if (!permissions.has('notifications')) return
        void client?.call('ui.badge', { count })
      },
    },
    icons: {
      url: iconUrl,
      colorUrl: colorIconUrl,
      index: loadIconIndex,
    },
    shell: {
      navigate(target) {
        require_('navigation', 'shell.navigate')
        if (embedded) void client?.call('shell.navigate', { target })
      },
      home() {
        require_('navigation', 'shell.home')
        if (embedded) void client?.call('shell.home', {})
      },
    },
    media: {
      async play(id, source) {
        require_('media', 'media.play')
        if (embedded) return client!.call<MediaSourceState>('media.play', { id, source })
        return getLocalMedia().play(appId, id, source)
      },
      async load(id, source) {
        require_('media', 'media.load')
        if (embedded) return client!.call<MediaSourceState>('media.load', { id, source })
        return getLocalMedia().load(appId, id, source)
      },
      async pause(id) {
        require_('media', 'media.pause')
        if (embedded) return client!.call<void>('media.pause', { id }).then(() => undefined)
        return getLocalMedia().pause(appId, id)
      },
      async resume(id) {
        require_('media', 'media.resume')
        if (embedded) return client!.call<void>('media.resume', { id }).then(() => undefined)
        return getLocalMedia().resume(appId, id)
      },
      async remove(id, fadeMs) {
        require_('media', 'media.remove')
        if (embedded) return client!.call<void>('media.remove', { id, fadeMs }).then(() => undefined)
        return getLocalMedia().remove(appId, id, fadeMs)
      },
      async clear() {
        require_('media', 'media.clear')
        if (embedded) return client!.call<void>('media.clear').then(() => undefined)
        return getLocalMedia().clear(appId)
      },
      async setVolume(id, volume, fadeMs) {
        require_('media', 'media.setVolume')
        if (embedded) return client!.call<void>('media.setVolume', { id, volume, fadeMs }).then(() => undefined)
        return getLocalMedia().setVolume(appId, id, volume, fadeMs)
      },
      async setMasterVolume(volume, fadeMs) {
        require_('media', 'media.setMasterVolume')
        if (embedded) return client!.call<void>('media.setMasterVolume', { volume, fadeMs }).then(() => undefined)
        return getLocalMedia().setMasterVolume(appId, volume, fadeMs)
      },
      async setPaused(paused) {
        require_('media', 'media.setPaused')
        if (embedded) return client!.call<void>('media.setPaused', { paused }).then(() => undefined)
        return getLocalMedia().setPaused(appId, paused)
      },
      async setMetadata(id, meta) {
        require_('media', 'media.setMetadata')
        if (embedded) return client!.call<void>('media.setMetadata', { id, meta }).then(() => undefined)
        return getLocalMedia().setMetadata(appId, id, meta)
      },
      async list() {
        require_('media', 'media.list')
        if (embedded) return client!.call<MediaSourceState[]>('media.list')
        return getLocalMedia().list(appId)
      },
      async setSleepTimer(ms) {
        require_('media', 'media.setSleepTimer')
        if (embedded) return client!.call<void>('media.setSleepTimer', { ms }).then(() => undefined)
        return getLocalMedia().setSleepTimer(appId, ms)
      },
      onState(handler) {
        mediaStateListeners.add(handler)
        return () => mediaStateListeners.delete(handler)
      },
      onCommand(handler) {
        mediaCommandListeners.add(handler)
        return () => mediaCommandListeners.delete(handler)
      },
    },
    scheduler: {
      async schedule(draft) {
        require_('scheduler', 'scheduler.schedule')
        if (embedded) return client!.call<ScheduleItem>('scheduler.schedule', draft)
        return localScheduler.schedule(draft)
      },
      async cancel(id) {
        require_('scheduler', 'scheduler.cancel')
        if (embedded) return client!.call<boolean>('scheduler.cancel', { id })
        return localScheduler.cancel(id)
      },
      async snooze(id, ms) {
        require_('scheduler', 'scheduler.snooze')
        if (embedded) return client!.call<boolean>('scheduler.snooze', { id, ms })
        return localScheduler.snooze(id, ms)
      },
      async list() {
        require_('scheduler', 'scheduler.list')
        if (embedded) return client!.call<ScheduleItem[]>('scheduler.list')
        return localScheduler.list()
      },
      async clear() {
        require_('scheduler', 'scheduler.clear')
        if (embedded) {
          await client!.call('scheduler.clear')
          return
        }
        await localScheduler.clear()
      },
      onFired(handler) {
        return bus.on('scheduler:fired', handler)
      },
    },
    bus: {
      on: (channel, handler) => bus.on(channel, handler),
      emit(channel, payload) {
        bus.emit(channel, payload)
        if (embedded) client?.emitEvent(channel, payload)
      },
    },
    on: (channel, handler) => bus.on(channel, handler),
    setAssetBase: setIconsBase,
  }

  void cache.prune()
  return api
}

export { BridgeError }
