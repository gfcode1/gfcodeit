import type { GFApi } from '../../../src/core/sdk'
import type { MediaState } from '../../../src/core/types'
import type { SoundDef } from './catalog'

const VOLUME_FADE_MS = 120
const REMOVE_FADE_MS = 200

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Layered ambient mixer backed by the framework media hub. Each active sound is
 * one hub source with its own volume; the hub owns playback so layers keep
 * playing while the app is backgrounded or unmounted.
 */
export class SoundEngine {
  private readonly gf: GFApi
  private readonly onChange: () => void
  private readonly volumes = new Map<string, number>()
  private master = 0.8
  private paused = true
  private readonly unsubscribe: () => void

  constructor(gf: GFApi, onChange: () => void = () => {}) {
    this.gf = gf
    this.onChange = onChange
    this.unsubscribe = gf.media.onState((state) => this.sync(state))
    // Re-attach to layers the shell still plays after an app remount.
    void gf.media
      .list()
      .then((sources) => {
        if (sources.length === 0) return
        for (const source of sources) this.volumes.set(source.id, source.volume)
        this.paused = !sources.some(
          (source) => source.status === 'playing' || source.status === 'loading',
        )
        this.onChange()
      })
      .catch(() => undefined)
  }

  get isPaused(): boolean {
    return this.paused
  }

  get count(): number {
    return this.volumes.size
  }

  get masterVolume(): number {
    return this.master
  }

  activeIds(): string[] {
    return [...this.volumes.keys()]
  }

  has(id: string): boolean {
    return this.volumes.has(id)
  }

  add(def: SoundDef, volume: number): void {
    if (this.volumes.has(def.id)) return
    this.volumes.set(def.id, clamp(volume))
    const source = { url: def.url, loop: true, volume: clamp(volume) }
    if (this.paused) void this.gf.media.load(def.id, source)
    else void this.gf.media.play(def.id, source)
    this.onChange()
  }

  remove(id: string): void {
    if (!this.volumes.delete(id)) return
    void this.gf.media.remove(id, REMOVE_FADE_MS)
    this.onChange()
  }

  setVolume(id: string, volume: number): void {
    if (!this.volumes.has(id)) return
    this.volumes.set(id, clamp(volume))
    void this.gf.media.setVolume(id, clamp(volume), VOLUME_FADE_MS)
  }

  setMasterVolume(value: number): void {
    this.master = clamp(value)
    void this.gf.media.setMasterVolume(this.master)
  }

  setPaused(next: boolean): void {
    if (this.paused === next) return
    this.paused = next
    void this.gf.media.setPaused(next)
    this.onChange()
  }

  clear(): void {
    this.volumes.clear()
    void this.gf.media.clear()
    this.onChange()
  }

  /** Drops listeners; standalone playback is cleared, shell playback is kept. */
  dispose(): void {
    this.unsubscribe()
    if (!this.gf.embedded) void this.gf.media.clear()
  }

  private sync(state: MediaState): void {
    if (state.owner && state.owner !== this.gf.appId) return
    const ids = new Set(state.sources.map((source) => source.id))
    let changed = false
    for (const id of [...this.volumes.keys()]) {
      if (!ids.has(id)) {
        this.volumes.delete(id)
        changed = true
      }
    }
    for (const source of state.sources) {
      if (this.volumes.get(source.id) !== source.volume) {
        this.volumes.set(source.id, source.volume)
        changed = true
      }
    }
    if (state.sources.length > 0 && state.paused !== this.paused) {
      this.paused = state.paused
      changed = true
    }
    if (changed) this.onChange()
  }
}
