import type { SoundDef } from './catalog'

const FADE_MS = 400
const VOLUME_FADE_MS = 120

interface Layer {
  def: SoundDef
  audio: HTMLAudioElement
  volume: number
  raf: number | null
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Minimal layered audio mixer. One looping HTMLAudioElement per active sound,
 * with per-sound and master gain, smoothed fades, and a global pause.
 */
export class SoundEngine {
  private readonly layers = new Map<string, Layer>()
  private master = 0.8
  private paused = true
  private readonly onChange: () => void

  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange
  }

  get isPaused(): boolean {
    return this.paused
  }

  get count(): number {
    return this.layers.size
  }

  get masterVolume(): number {
    return this.master
  }

  activeIds(): string[] {
    return [...this.layers.keys()]
  }

  has(id: string): boolean {
    return this.layers.has(id)
  }

  add(def: SoundDef, volume: number): void {
    if (this.layers.has(def.id)) return
    const audio = new Audio(def.url)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    const layer: Layer = { def, audio, volume: clamp(volume), raf: null }
    this.layers.set(def.id, layer)
    if (!this.paused) {
      void audio.play().catch(() => undefined)
      this.fadeTo(layer, this.effective(layer))
    }
    this.onChange()
  }

  remove(id: string): void {
    const layer = this.layers.get(id)
    if (!layer) return
    this.layers.delete(id)
    this.fadeTo(layer, 0, () => {
      layer.audio.pause()
      layer.audio.removeAttribute('src')
      layer.audio.load()
    })
    this.onChange()
  }

  setVolume(id: string, volume: number): void {
    const layer = this.layers.get(id)
    if (!layer) return
    layer.volume = clamp(volume)
    if (!this.paused) this.fadeTo(layer, this.effective(layer), undefined, VOLUME_FADE_MS)
  }

  setMasterVolume(value: number): void {
    this.master = clamp(value)
    if (this.paused) return
    for (const layer of this.layers.values()) {
      this.fadeTo(layer, this.effective(layer), undefined, VOLUME_FADE_MS)
    }
  }

  setPaused(next: boolean): void {
    if (this.paused === next) return
    this.paused = next
    for (const layer of this.layers.values()) {
      if (next) {
        this.fadeTo(layer, 0, () => layer.audio.pause())
      } else {
        void layer.audio.play().catch(() => undefined)
        this.fadeTo(layer, this.effective(layer))
      }
    }
    this.onChange()
  }

  clear(): void {
    for (const id of [...this.layers.keys()]) this.remove(id)
  }

  /** Stops audio immediately without fades (used on page teardown). */
  dispose(): void {
    for (const layer of this.layers.values()) {
      if (layer.raf !== null) cancelAnimationFrame(layer.raf)
      layer.audio.pause()
    }
    this.layers.clear()
  }

  private effective(layer: Layer): number {
    return this.paused ? 0 : layer.volume * this.master
  }

  private fadeTo(
    layer: Layer,
    target: number,
    onDone?: () => void,
    duration = FADE_MS,
  ): void {
    if (layer.raf !== null) {
      cancelAnimationFrame(layer.raf)
      layer.raf = null
    }
    const start = layer.audio.volume
    const to = clamp(target)
    if (Math.abs(start - to) < 0.001) {
      layer.audio.volume = to
      onDone?.()
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      layer.audio.volume = clamp(start + (to - start) * t)
      if (t < 1) {
        layer.raf = requestAnimationFrame(step)
      } else {
        layer.raf = null
        onDone?.()
      }
    }
    layer.raf = requestAnimationFrame(step)
  }
}
