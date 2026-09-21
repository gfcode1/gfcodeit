import type { GFApi } from '../../../src/core/sdk'
import type { MediaSourceInit, MediaState } from '../../../src/core/types'
import type { Station } from './api'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlayerState {
  status: PlayerStatus
  station: Station | null
  error: string | null
}

export interface PlayerHandlers {
  onState(state: PlayerState): void
  onTrackChange(direction: 'next' | 'previous'): void
}

const SOURCE_ID = 'stream'
const STALL_MS = 15000

function candidateUrls(station: Station): string[] {
  const urls = [station.urlResolved, station.url].map((url) => url.trim()).filter(Boolean)
  return [...new Set(urls)]
}

/**
 * Radio player driving the framework media hub. Playback lives in the shell,
 * so the stream keeps playing when the app is backgrounded or unmounted.
 */
export class RadioPlayer {
  private readonly gf: GFApi
  private readonly handlers: PlayerHandlers
  private station: Station | null = null
  private sources: string[] = []
  private sourceIndex = 0
  private retried = false
  private status: PlayerStatus = 'idle'
  private error: string | null = null
  private generation = 0
  private stallTimer: number | null = null
  private level = 1
  private readonly unsubscribe: () => void

  constructor(gf: GFApi, handlers: PlayerHandlers) {
    this.gf = gf
    this.handlers = handlers
    this.unsubscribe = gf.media.onState((state) => this.onMediaState(state))
    gf.media.onCommand((command) => {
      if (command.action === 'next') this.handlers.onTrackChange('next')
      else if (command.action === 'previous') this.handlers.onTrackChange('previous')
    })
  }

  /** Re-attaches to a stream the shell is still playing (on app remount). */
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
      this.setStatus(source.status, null)
    } else if (source.status === 'paused') {
      this.setStatus('paused', null)
    } else if (source.status === 'error') {
      this.setStatus('error', source.error ?? 'Stream unavailable')
    }
  }

  get state(): PlayerState {
    return { status: this.status, station: this.station, error: this.error }
  }

  get currentStation(): Station | null {
    return this.station
  }

  get volume(): number {
    return this.level
  }

  setVolume(value: number): void {
    this.level = Math.min(1, Math.max(0, value))
    void this.gf.media.setVolume(SOURCE_ID, this.level)
  }

  /** Sets the station without starting playback (used to restore the last one). */
  load(station: Station): void {
    this.generation += 1
    this.station = station
    this.sources = candidateUrls(station)
    this.sourceIndex = 0
    this.retried = false
    this.error = null
    this.clearStall()
    this.setStatus('paused', null)
  }

  async play(station: Station): Promise<void> {
    this.generation += 1
    this.station = station
    this.sources = candidateUrls(station)
    this.sourceIndex = 0
    this.retried = false
    this.error = null
    if (!station.isSecure && window.location.protocol === 'https:') {
      this.setStatus('error', 'This station only offers an insecure (HTTP) stream and cannot play over HTTPS.')
      return
    }
    if (this.sources.length === 0) {
      this.setStatus('error', 'No stream available')
      return
    }
    this.setStatus('loading', null)
    await this.gf.media.play(SOURCE_ID, this.initFor(station, this.sources[0]!))
  }

  toggle(): void {
    if (this.status === 'playing' || this.status === 'loading') {
      this.clearStall()
      void this.gf.media.pause(SOURCE_ID)
      return
    }
    if (!this.station) return
    void this.play(this.station)
  }

  stop(): void {
    this.generation += 1
    this.clearStall()
    void this.gf.media.remove(SOURCE_ID)
    this.setStatus('idle', null)
  }

  /** Drops listeners; standalone playback is cleared, shell playback is kept. */
  dispose(): void {
    this.clearStall()
    this.unsubscribe()
    if (!this.gf.embedded) void this.gf.media.clear()
  }

  private initFor(station: Station, url: string): MediaSourceInit {
    const detail = [...station.tags.slice(0, 2), station.country].filter(Boolean).join(' · ')
    return {
      url,
      volume: this.level,
      title: station.name,
      artist: detail || 'Radio Browser',
      album: [station.codec, station.bitrate ? `${station.bitrate}k` : ''].filter(Boolean).join(' · '),
      artwork: station.favicon && station.isSecure ? station.favicon : undefined,
    }
  }

  private onMediaState(state: MediaState): void {
    const source = state.sources.find((item) => item.id === SOURCE_ID)
    if (!source) {
      if (this.status !== 'idle') this.setStatus('idle', null)
      return
    }
    if (source.status === 'loading') {
      this.armStall()
      this.setStatus('loading', null)
    } else if (source.status === 'playing') {
      this.clearStall()
      this.setStatus('playing', null)
    } else if (source.status === 'paused') {
      this.clearStall()
      this.setStatus('paused', null)
    } else if (source.status === 'error') {
      this.clearStall()
      void this.nextSource(source.error ?? 'Stream unavailable')
    }
  }

  private async nextSource(reason: string): Promise<void> {
    if (this.sources.length === 0) {
      this.setStatus('error', reason)
      return
    }
    if (this.sourceIndex + 1 < this.sources.length) {
      this.sourceIndex += 1
    } else if (!this.retried) {
      this.retried = true
      this.sourceIndex = 0
    } else {
      this.setStatus('error', reason)
      return
    }
    const station = this.station
    const url = this.sources[this.sourceIndex]
    if (!station || !url) return
    this.generation += 1
    this.setStatus('loading', null)
    await this.gf.media.play(SOURCE_ID, this.initFor(station, url))
  }

  private armStall(): void {
    this.clearStall()
    this.stallTimer = window.setTimeout(() => {
      if (this.status === 'loading') void this.nextSource('Stream timed out')
    }, STALL_MS)
  }

  private clearStall(): void {
    if (this.stallTimer !== null) {
      window.clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }

  private setStatus(status: PlayerStatus, error: string | null): void {
    this.status = status
    this.error = error
    this.handlers.onState(this.state)
  }
}
