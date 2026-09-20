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

const STALL_MS = 15000

function candidateUrls(station: Station): string[] {
  const urls = [station.urlResolved, station.url].map((url) => url.trim()).filter(Boolean)
  return [...new Set(urls)]
}

export class RadioPlayer {
  private readonly audio = new Audio()
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

  constructor(handlers: PlayerHandlers) {
    this.handlers = handlers
    this.audio.preload = 'none'
    // No crossOrigin: most radio streams (Icecast/Shoutcast) send no CORS
    // headers, and requesting them would make the stream fail to load.
    this.audio.volume = this.level
    this.bind()
    this.setupMediaSession()
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
    this.audio.volume = this.level
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
    this.audio.removeAttribute('src')
    this.audio.load()
    this.setStatus('paused')
  }

  async play(station: Station): Promise<void> {
    this.generation += 1
    const gen = this.generation
    this.station = station
    this.sources = candidateUrls(station)
    this.sourceIndex = 0
    this.retried = false
    this.error = null
    if (!station.isSecure && window.location.protocol === 'https:') {
      this.fail('This station only offers an insecure (HTTP) stream and cannot play over HTTPS.')
      return
    }
    if (this.sources.length === 0) {
      this.fail('No stream available')
      return
    }
    this.setStatus('loading')
    await this.playCurrent(gen)
  }

  toggle(): void {
    if (this.status === 'playing' || this.status === 'loading') {
      this.clearStall()
      this.audio.pause()
      this.setStatus('paused')
      return
    }
    if (!this.station) return
    if (this.audio.src && this.sources.length > 0) {
      this.generation += 1
      const gen = this.generation
      this.setStatus('loading')
      this.armStall()
      this.audio.play().catch((error: unknown) => {
        if (gen !== this.generation) return
        if ((error as Error).name === 'NotAllowedError') this.setStatus('paused')
        else void this.nextSource('Playback failed', gen)
      })
      return
    }
    void this.play(this.station)
  }

  stop(): void {
    this.generation += 1
    this.clearStall()
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.sources = []
    this.sourceIndex = 0
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
      void this.nextSource('Stream unavailable')
    })
  }

  private async playCurrent(gen: number): Promise<void> {
    const url = this.sources[this.sourceIndex]
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
      await this.nextSource('Playback failed', gen)
    }
  }

  private async nextSource(reason: string, gen: number = this.generation): Promise<void> {
    if (gen !== this.generation) return
    this.clearStall()
    if (this.sources.length === 0) {
      this.fail(reason)
      return
    }
    if (this.sourceIndex + 1 < this.sources.length) {
      this.sourceIndex += 1
    } else if (!this.retried) {
      this.retried = true
      this.sourceIndex = 0
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
      if (this.status === 'loading') void this.nextSource('Stream timed out')
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
    const station = this.station
    if (!station) return
    const detail = [...station.tags.slice(0, 2), station.country].filter(Boolean).join(' · ')
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: detail || 'Radio Browser',
        album: [station.codec, station.bitrate ? `${station.bitrate}k` : ''].filter(Boolean).join(' · '),
        artwork: station.favicon && station.isSecure ? [{ src: station.favicon }] : [],
      })
      navigator.mediaSession.playbackState = this.status === 'playing' ? 'playing' : 'paused'
    } catch {
      // Ignore metadata failures.
    }
  }
}
