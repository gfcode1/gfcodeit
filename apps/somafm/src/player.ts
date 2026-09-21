import type { GFApi } from '../../../src/core/sdk'
import type { MediaSourceInit, MediaState } from '../../../src/core/types'
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

const SOURCE_ID = 'stream'
const STALL_MS = 15000

/**
 * SomaFM player driving the framework media hub. Playback lives in the shell so
 * the station keeps playing while the app is backgrounded or unmounted.
 */
export class RadioPlayer {
  private readonly gf: GFApi
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
  private readonly unsubscribe: () => void

  constructor(
    gf: GFApi,
    resolveStream: (stream: StreamVariant) => Promise<string[]>,
    handlers: PlayerHandlers,
  ) {
    this.gf = gf
    this.resolveStream = resolveStream
    this.handlers = handlers
    this.unsubscribe = gf.media.onState((state) => this.onMediaState(state))
    gf.media.onCommand((command) => {
      if (command.action === 'next') this.handlers.onTrackChange('next')
      else if (command.action === 'previous') this.handlers.onTrackChange('previous')
    })
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

  /** Re-attaches to a channel the shell is still playing (on app remount). */
  async refresh(): Promise<void> {
    let sources
    try {
      sources = await this.gf.media.list()
    } catch {
      return
    }
    const source = sources.find((item) => item.id === SOURCE_ID)
    if (!source) return
    if (source.status === 'playing' || source.status === 'loading') {
      this.armStall()
      this.setStatus(source.status)
    } else if (source.status === 'paused') {
      this.setStatus('paused')
    } else if (source.status === 'error') {
      this.error = source.error ?? 'Stream unavailable'
      this.setStatus('error')
    }
  }

  setVolume(value: number): void {
    this.level = Math.min(1, Math.max(0, value))
    void this.gf.media.setVolume(SOURCE_ID, this.level)
  }

  setSong(song: Song | null): void {
    this.song = song
    void this.gf.media.setMetadata(SOURCE_ID, this.metadata())
  }

  /** Sets the channel without starting playback (used to restore the last one). */
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
      void this.gf.media.pause(SOURCE_ID)
      return
    }
    if (!this.channel || !this.stream) return
    void this.play(this.channel, this.stream)
  }

  stop(): void {
    this.generation += 1
    this.clearStall()
    void this.gf.media.remove(SOURCE_ID)
    this.setStatus('idle')
  }

  /** Drops listeners; standalone playback is cleared, shell playback is kept. */
  dispose(): void {
    this.clearStall()
    this.unsubscribe()
    if (!this.gf.embedded) void this.gf.media.clear()
  }

  private metadata(): Partial<MediaSourceInit> {
    const channel = this.channel
    if (!channel) return {}
    const song = this.song
    return {
      title: song?.title || channel.title,
      artist: song?.artist || (channel.dj ? `DJ ${channel.dj}` : 'SomaFM'),
      album: song?.album || channel.description,
      artwork: channel.xlImage || undefined,
    }
  }

  private initFor(url: string): MediaSourceInit {
    return { url, crossOrigin: true, volume: this.level, ...this.metadata() }
  }

  private onMediaState(state: MediaState): void {
    const source = state.sources.find((item) => item.id === SOURCE_ID)
    if (!source) {
      if (this.status !== 'idle') this.setStatus('idle')
      return
    }
    if (source.status === 'loading') {
      this.armStall()
      this.setStatus('loading')
    } else if (source.status === 'playing') {
      this.clearStall()
      this.setStatus('playing')
    } else if (source.status === 'paused') {
      this.clearStall()
      this.setStatus('paused')
    } else if (source.status === 'error') {
      this.clearStall()
      void this.nextMirror(source.error ?? 'Stream unavailable')
    }
  }

  private async playCurrent(gen: number): Promise<void> {
    const url = this.mirrors[this.mirrorIndex]
    if (!url) {
      this.fail('Stream unavailable')
      return
    }
    if (gen !== this.generation) return
    await this.gf.media.play(SOURCE_ID, this.initFor(url))
  }

  private async nextMirror(reason: string): Promise<void> {
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
    this.generation += 1
    const gen = this.generation
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
    this.handlers.onState(this.state)
  }

  private fail(message: string): void {
    this.error = message
    this.setStatus('error')
  }
}
