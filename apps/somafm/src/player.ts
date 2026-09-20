import type { Channel, Song, StreamVariant } from './somafm'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerState {
  status: PlayerStatus
  channel: Channel | null
  stream: StreamVariant | null
  error: string | null
}

export interface PlayerHandlers {
  onState(state: PlayerState): void
  onTrackChange(direction: 'next' | 'previous'): void
}

const STALL_MS = 15000

export class RadioPlayer {
  private readonly audio = new Audio()
  private readonly resolveStream: (stream: StreamVariant) => Promise<string[]>
  private readonly handlers: PlayerHandlers
  private channel: Channel | null = null
  private stream: StreamVariant | null = null
  private song: Song | null = null
  private mirrors: string[] = []
  private mirrorIndex = 0
  private retried = false
  private status: PlayerStatus = 'idle'
  private error: string | null = null
  private generation = 0
  private stallTimer: number | null = null
  private level = 1

  constructor(resolveStream: (stream: StreamVariant) => Promise<string[]>, handlers: PlayerHandlers) {
    this.resolveStream = resolveStream
    this.handlers = handlers
    this.audio.preload = 'none'
    this.audio.crossOrigin = 'anonymous'
    this.audio.volume = this.level
    this.bind()
    this.setupMediaSession()
  }

  get state(): PlayerState {
    return { status: this.status, channel: this.channel, stream: this.stream, error: this.error }
  }

  get currentChannel(): Channel | null {
    return this.channel
  }

  get volume(): number {
    return this.level
  }

  setVolume(value: number): void {
    this.level = Math.min(1, Math.max(0, value))
    this.audio.volume = this.level
  }

  setSong(song: Song | null): void {
    this.song = song
    this.updateMediaSession()
  }

  /** Sets the channel without starting playback (used to restore the last channel). */
  load(channel: Channel, stream: StreamVariant): void {
    this.generation += 1
    this.channel = channel
    this.stream = stream
    this.song = null
    this.mirrors = []
    this.mirrorIndex = 0
    this.retried = false
    this.error = null
    this.clearStall()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.setStatus('paused')
  }

  async play(channel: Channel, stream: StreamVariant): Promise<void> {
    this.generation += 1
    const gen = this.generation
    this.channel = channel
    this.stream = stream
    this.song = null
    this.mirrors = []
    this.mirrorIndex = 0
    this.retried = false
    this.error = null
    this.setStatus('loading')
    try {
      const urls = await this.resolveStream(stream)
      if (gen !== this.generation) return
      if (urls.length === 0) {
        this.fail('No stream available')
        return
      }
      this.mirrors = urls
      await this.playCurrent(gen)
    } catch (error) {
      if (gen !== this.generation) return
      this.fail((error as Error).message)
    }
  }

  toggle(): void {
    if (this.status === 'playing' || this.status === 'loading') {
      this.clearStall()
      this.audio.pause()
      this.setStatus('paused')
      return
    }
    if (!this.channel || !this.stream) return
    if (this.audio.src && this.mirrors.length > 0) {
      this.generation += 1
      const gen = this.generation
      this.setStatus('loading')
      this.armStall()
      this.audio.play().catch((error: unknown) => {
        if (gen !== this.generation) return
        if ((error as Error).name === 'NotAllowedError') this.setStatus('paused')
        else void this.nextMirror('Playback failed', gen)
      })
      return
    }
    void this.play(this.channel, this.stream)
  }

  stop(): void {
    this.generation += 1
    this.clearStall()
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.mirrors = []
    this.mirrorIndex = 0
    this.setStatus('idle')
  }

  private bind(): void {
    this.audio.addEventListener('playing', () => {
      this.clearStall()
      this.setStatus('playing')
    })
    this.audio.addEventListener('canplay', () => this.clearStall())
    this.audio.addEventListener('pause', () => {
      if (this.status === 'playing') this.setStatus('paused')
    })
    this.audio.addEventListener('stalled', () => this.armStall())
    this.audio.addEventListener('waiting', () => this.armStall())
    this.audio.addEventListener('error', () => {
      if (this.status !== 'playing' && this.status !== 'loading') return
      if (!this.audio.src) return
      void this.nextMirror('Stream unavailable')
    })
  }

  private async playCurrent(gen: number): Promise<void> {
    const url = this.mirrors[this.mirrorIndex]
    if (!url) {
      this.fail('Stream unavailable')
      return
    }
    this.audio.src = url
    this.audio.load()
    this.armStall()
    try {
      await this.audio.play()
    } catch (error) {
      if (gen !== this.generation) return
      if ((error as Error).name === 'NotAllowedError') {
        this.setStatus('paused')
        return
      }
      await this.nextMirror('Playback failed', gen)
    }
  }

  private async nextMirror(reason: string, gen: number = this.generation): Promise<void> {
    if (gen !== this.generation) return
    this.clearStall()
    if (this.mirrors.length === 0) {
      this.fail(reason)
      return
    }
    if (this.mirrorIndex + 1 < this.mirrors.length) {
      this.mirrorIndex += 1
    } else if (!this.retried) {
      this.retried = true
      this.mirrorIndex = 0
    } else {
      this.fail(reason)
      return
    }
    this.setStatus('loading')
    await this.playCurrent(gen)
  }

  private armStall(): void {
    this.clearStall()
    this.stallTimer = window.setTimeout(() => {
      if (this.status === 'loading') void this.nextMirror('Stream timed out')
    }, STALL_MS)
  }

  private clearStall(): void {
    if (this.stallTimer !== null) {
      window.clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }

  private setStatus(status: PlayerStatus): void {
    this.status = status
    this.updateMediaSession()
    this.handlers.onState(this.state)
  }

  private fail(message: string): void {
    this.error = message
    this.setStatus('error')
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('play', () => this.toggle())
      navigator.mediaSession.setActionHandler('pause', () => this.toggle())
      navigator.mediaSession.setActionHandler('stop', () => this.stop())
      navigator.mediaSession.setActionHandler('nexttrack', () => this.handlers.onTrackChange('next'))
      navigator.mediaSession.setActionHandler('previoustrack', () =>
        this.handlers.onTrackChange('previous'),
      )
    } catch {
      // Media Session is unavailable in this context — playback still works.
    }
  }

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    const channel = this.channel
    if (!channel) return
    const song = this.song
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song?.title || channel.title,
        artist: song?.artist || (channel.dj ? `DJ ${channel.dj}` : 'SomaFM'),
        album: song?.album || channel.description,
        artwork: channel.xlImage ? [{ src: channel.xlImage, sizes: '512x512' }] : [],
      })
      navigator.mediaSession.playbackState = this.status === 'playing' ? 'playing' : 'paused'
    } catch {
      // Ignore metadata failures.
    }
  }
}
