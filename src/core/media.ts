/**
 * Centralized media hub. The shell owns every audio element so playback keeps
 * running while apps are hidden or unmounted; apps drive it through `gf.media`.
 *
 * Playback is exclusive across apps: when one app starts audio, any other owning
 * app is stopped and notified. Within a single app, several sources can mix
 * (Soundscape layers each one with its own volume and a shared master).
 */

import type {
  MediaCommand,
  MediaSourceInit,
  MediaSourceState,
  MediaState,
  MediaStatus,
} from './types'

const DEFAULT_MASTER = 0.8

interface Source {
  id: string
  owner: string
  url: string
  audio: HTMLAudioElement
  volume: number
  loop: boolean
  crossOrigin: boolean
  title?: string
  artist?: string
  album?: string
  artwork?: string
  status: MediaStatus
  error?: string
  raf: number | null
  hasSrc: boolean
}

interface Session {
  owner: string
  master: number
  paused: boolean
  sources: Map<string, Source>
}

export interface MediaHub {
  play(owner: string, id: string, init: MediaSourceInit): Promise<MediaSourceState>
  load(owner: string, id: string, init: MediaSourceInit): Promise<MediaSourceState>
  pause(owner: string, id?: string): Promise<void>
  resume(owner: string, id?: string): Promise<void>
  toggle(owner: string): Promise<void>
  remove(owner: string, id: string, fadeMs?: number): Promise<void>
  clear(owner: string): Promise<void>
  setVolume(owner: string, id: string, volume: number, fadeMs?: number): Promise<void>
  setMasterVolume(owner: string, volume: number, fadeMs?: number): Promise<void>
  setPaused(owner: string, paused: boolean): Promise<void>
  setMetadata(owner: string, id: string, meta: Partial<MediaSourceInit>): Promise<void>
  list(owner: string): Promise<MediaSourceState[]>
  setSleepTimer(owner: string, ms: number | null): Promise<void>
  /** Stops everything (used on profile switch). */
  stopAll(): void
  state(): MediaState
  onState(handler: (state: MediaState) => void): () => void
  onOwnerChange(handler: (owner: string, state: MediaState) => void): () => void
  onCommand(handler: (command: MediaCommand) => void): () => void
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function statusOf(sources: MediaSourceState[], paused: boolean): MediaStatus {
  if (sources.length === 0) return 'idle'
  if (sources.some((source) => source.status === 'error')) return 'error'
  if (sources.some((source) => source.status === 'loading')) return 'loading'
  if (paused) return 'paused'
  if (sources.some((source) => source.status === 'playing')) return 'playing'
  return 'paused'
}

function toState(source: Source): MediaSourceState {
  return {
    id: source.id,
    status: source.status,
    volume: source.volume,
    loop: source.loop,
    crossOrigin: source.crossOrigin,
    error: source.error,
    title: source.title,
    artist: source.artist,
    album: source.album,
    artwork: source.artwork,
  }
}

export function createMediaHub(): MediaHub {
  const sessions = new Map<string, Session>()
  const sleepTimers = new Map<string, number>()
  const stateListeners = new Set<(state: MediaState) => void>()
  const ownerListeners = new Set<(owner: string, state: MediaState) => void>()
  const commandListeners = new Set<(command: MediaCommand) => void>()
  let activeOwner: string | null = null

  function sessionFor(owner: string): Session {
    let session = sessions.get(owner)
    if (!session) {
      session = { owner, master: DEFAULT_MASTER, paused: false, sources: new Map() }
      sessions.set(owner, session)
    }
    return session
  }

  function ownerState(owner: string): MediaState {
    const session = sessions.get(owner)
    if (!session) {
      return { owner, status: 'idle', paused: false, master: DEFAULT_MASTER, sources: [] }
    }
    const sources = [...session.sources.values()].map(toState)
    const active = sources.some(
      (source) => source.status === 'playing' || source.status === 'loading',
    )
    const paused = session.paused || !active
    return {
      owner,
      status: statusOf(sources, paused),
      paused,
      master: session.master,
      sources,
    }
  }

  function state(): MediaState {
    if (!activeOwner) {
      return { owner: null, status: 'idle', paused: false, master: DEFAULT_MASTER, sources: [] }
    }
    return ownerState(activeOwner)
  }

  function emit(owner?: string): void {
    if (owner) {
      const snapshot = ownerState(owner)
      for (const handler of ownerListeners) handler(owner, snapshot)
    }
    const aggregate = state()
    for (const handler of stateListeners) handler(aggregate)
    syncMediaSession()
  }

  function emitCommand(command: MediaCommand): void {
    for (const handler of commandListeners) handler(command)
  }

  function fade(source: Source, to: number, ms: number): void {
    if (source.raf !== null) {
      cancelAnimationFrame(source.raf)
      source.raf = null
    }
    const target = clamp(to)
    const start = source.audio.volume
    if (ms <= 0 || Math.abs(start - target) < 0.001) {
      source.audio.volume = target
      return
    }
    const t0 = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / ms)
      source.audio.volume = clamp(start + (target - start) * t)
      if (t < 1) source.raf = requestAnimationFrame(step)
      else source.raf = null
    }
    source.raf = requestAnimationFrame(step)
  }

  function applyEffective(source: Source, master: number, fadeMs: number): void {
    fade(source, source.volume * master, fadeMs)
  }

  function disposeSource(source: Source): void {
    if (source.raf !== null) {
      cancelAnimationFrame(source.raf)
      source.raf = null
    }
    source.audio.pause()
    source.audio.removeAttribute('src')
    source.audio.load()
  }

  function createSource(owner: string, id: string, init: MediaSourceInit): Source {
    const audio = new Audio()
    audio.preload = 'none'
    if (init.crossOrigin) audio.crossOrigin = 'anonymous'
    audio.loop = init.loop ?? false
    audio.volume = 0
    const source: Source = {
      id,
      owner,
      url: init.url,
      audio,
      volume: clamp(init.volume ?? 1),
      loop: init.loop ?? false,
      crossOrigin: init.crossOrigin ?? false,
      title: init.title,
      artist: init.artist,
      album: init.album,
      artwork: init.artwork,
      status: 'paused',
      raf: null,
      hasSrc: false,
    }
    audio.addEventListener('playing', () => {
      if (source.status === 'playing') return
      source.status = 'playing'
      source.error = undefined
      emit(owner)
    })
    audio.addEventListener('pause', () => {
      if (source.status !== 'playing' && source.status !== 'loading') return
      source.status = 'paused'
      emit(owner)
    })
    audio.addEventListener('error', () => {
      if (!source.audio.src || source.status === 'error') return
      source.status = 'error'
      source.error = 'Stream unavailable'
      emit(owner)
    })
    audio.addEventListener('ended', () => {
      if (source.loop) return
      source.status = 'paused'
      emit(owner)
    })
    return source
  }

  function currentSource(owner: string, id: string): Source | undefined {
    return sessions.get(owner)?.sources.get(id)
  }

  async function start(session: Session, source: Source): Promise<MediaSourceState> {
    source.status = 'loading'
    source.error = undefined
    if (!source.hasSrc) {
      source.audio.src = source.url
      source.audio.load()
      source.hasSrc = true
    }
    applyEffective(source, session.master, 0)
    try {
      await source.audio.play()
      if (currentSource(session.owner, source.id) !== source) return toState(source)
      source.status = 'playing'
    } catch (error) {
      if (currentSource(session.owner, source.id) !== source) return toState(source)
      const name = (error as Error).name
      if (name === 'NotAllowedError') {
        source.status = 'paused'
      } else if (name !== 'AbortError') {
        source.status = 'error'
        source.error = (error as Error).message || 'Playback failed'
      }
    }
    emit(session.owner)
    return toState(source)
  }

  function stopSession(owner: string): void {
    const session = sessions.get(owner)
    if (!session) return
    for (const source of session.sources.values()) disposeSource(source)
    session.sources.clear()
    sessions.delete(owner)
    clearSleepTimer(owner)
    emit(owner)
  }

  function claim(owner: string): void {
    if (activeOwner && activeOwner !== owner) stopSession(activeOwner)
    activeOwner = owner
  }

  function clearSleepTimer(owner: string): void {
    const timer = sleepTimers.get(owner)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      sleepTimers.delete(owner)
    }
  }

  function primarySource(session: Session): Source | undefined {
    const sources = [...session.sources.values()]
    return sources.find((source) => source.title) ?? sources[0]
  }

  const mediaSession: MediaSession | null =
    typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null

  function syncMediaSession(): void {
    if (!mediaSession) return
    const session = activeOwner ? sessions.get(activeOwner) : undefined
    const primary = session ? primarySource(session) : undefined
    try {
      if (primary?.title && typeof MediaMetadata !== 'undefined') {
        mediaSession.metadata = new MediaMetadata({
          title: primary.title,
          artist: primary.artist,
          album: primary.album,
          artwork: primary.artwork ? [{ src: primary.artwork }] : [],
        })
      } else {
        mediaSession.metadata = null
      }
      const status = state().status
      mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused'
    } catch {
      /* Media Session is unavailable in this context */
    }
  }

  if (mediaSession) {
    const bind = (
      action: Parameters<MediaSession['setActionHandler']>[0],
      handler: Parameters<MediaSession['setActionHandler']>[1],
    ): void => {
      try {
        mediaSession.setActionHandler(action, handler)
      } catch {
        /* action unsupported */
      }
    }
    bind('play', () => {
      if (activeOwner) void api.resume(activeOwner)
    })
    bind('pause', () => {
      if (activeOwner) void api.pause(activeOwner)
    })
    bind('stop', () => {
      if (activeOwner) void api.clear(activeOwner)
    })
    bind('nexttrack', () => emitCommand({ action: 'next' }))
    bind('previoustrack', () => emitCommand({ action: 'previous' }))
  }

  const api: MediaHub = {
    async play(owner, id, init) {
      claim(owner)
      const session = sessionFor(owner)
      session.paused = false
      const previous = session.sources.get(id)
      if (previous) disposeSource(previous)
      const source = createSource(owner, id, init)
      session.sources.set(id, source)
      emit(owner)
      return start(session, source)
    },

    async load(owner, id, init) {
      const session = sessionFor(owner)
      const existing = session.sources.get(id)
      if (existing) {
        // Re-attach (e.g. app remount): keep any live playback untouched.
        existing.volume = clamp(init.volume ?? existing.volume)
        existing.loop = init.loop ?? existing.loop
        if (init.crossOrigin !== undefined) existing.crossOrigin = init.crossOrigin
        if (init.title !== undefined) existing.title = init.title
        if (init.artist !== undefined) existing.artist = init.artist
        if (init.album !== undefined) existing.album = init.album
        if (init.artwork !== undefined) existing.artwork = init.artwork
        if (existing.url !== init.url && existing.status !== 'playing' && existing.status !== 'loading') {
          existing.url = init.url
          existing.hasSrc = false
        }
        applyEffective(existing, session.master, 0)
        emit(owner)
        return toState(existing)
      }
      const source = createSource(owner, id, init)
      source.status = 'paused'
      session.sources.set(id, source)
      emit(owner)
      return toState(source)
    },

    async pause(owner, id) {
      const session = sessions.get(owner)
      if (!session) return
      if (id) {
        const source = session.sources.get(id)
        if (!source) return
        source.audio.pause()
        source.status = 'paused'
      } else {
        session.paused = true
        for (const source of session.sources.values()) {
          source.audio.pause()
          source.status = 'paused'
        }
      }
      emit(owner)
    },

    async resume(owner, id) {
      const session = sessions.get(owner)
      if (!session) return
      claim(owner)
      if (id) {
        const source = session.sources.get(id)
        if (source) await start(session, source)
      } else {
        session.paused = false
        for (const source of session.sources.values()) void start(session, source)
      }
      emit(owner)
    },

    async toggle(owner) {
      const session = sessions.get(owner)
      if (!session) return
      const active = [...session.sources.values()].some(
        (source) => source.status === 'playing' || source.status === 'loading',
      )
      if (active && !session.paused) await api.pause(owner)
      else await api.resume(owner)
    },

    async remove(owner, id, fadeMs = 0) {
      const session = sessions.get(owner)
      const source = session?.sources.get(id)
      if (!session || !source) return
      session.sources.delete(id)
      if (fadeMs > 0) {
        fade(source, 0, fadeMs)
        window.setTimeout(() => disposeSource(source), fadeMs)
      } else {
        disposeSource(source)
      }
      if (session.sources.size === 0) {
        sessions.delete(owner)
        clearSleepTimer(owner)
        if (activeOwner === owner) activeOwner = null
      }
      emit(owner)
    },

    async clear(owner) {
      const session = sessions.get(owner)
      if (!session) return
      for (const source of session.sources.values()) disposeSource(source)
      session.sources.clear()
      sessions.delete(owner)
      clearSleepTimer(owner)
      if (activeOwner === owner) activeOwner = null
      emit(owner)
    },

    async setVolume(owner, id, volume, fadeMs = 0) {
      const session = sessions.get(owner)
      const source = session?.sources.get(id)
      if (!session || !source) return
      source.volume = clamp(volume)
      applyEffective(source, session.master, fadeMs)
      emit(owner)
    },

    async setMasterVolume(owner, volume, fadeMs = 0) {
      const session = sessionFor(owner)
      session.master = clamp(volume)
      for (const source of session.sources.values()) applyEffective(source, session.master, fadeMs)
      emit(owner)
    },

    async setPaused(owner, paused) {
      const session = sessions.get(owner)
      if (!session) return
      if (paused) {
        session.paused = true
        for (const source of session.sources.values()) {
          source.audio.pause()
          source.status = 'paused'
        }
      } else {
        claim(owner)
        session.paused = false
        for (const source of session.sources.values()) void start(session, source)
      }
      emit(owner)
    },

    async setMetadata(owner, id, meta) {
      const session = sessions.get(owner)
      const source = session?.sources.get(id)
      if (!session || !source) return
      if (meta.title !== undefined) source.title = meta.title
      if (meta.artist !== undefined) source.artist = meta.artist
      if (meta.album !== undefined) source.album = meta.album
      if (meta.artwork !== undefined) source.artwork = meta.artwork
      emit(owner)
    },

    async list(owner) {
      return ownerState(owner).sources
    },

    async setSleepTimer(owner, ms) {
      clearSleepTimer(owner)
      if (ms === null || ms <= 0) return
      const timer = window.setTimeout(() => {
        sleepTimers.delete(owner)
        void api.clear(owner)
      }, ms)
      sleepTimers.set(owner, timer)
    },

    stopAll() {
      for (const owner of [...sessions.keys()]) stopSession(owner)
      activeOwner = null
      emit()
    },

    state,

    onState(handler) {
      stateListeners.add(handler)
      return () => stateListeners.delete(handler)
    },

    onOwnerChange(handler) {
      ownerListeners.add(handler)
      return () => ownerListeners.delete(handler)
    },

    onCommand(handler) {
      commandListeners.add(handler)
      return () => commandListeners.delete(handler)
    },
  }

  return api
}
