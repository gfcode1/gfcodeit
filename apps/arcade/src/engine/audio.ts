export interface Sfx {
  readonly muted: boolean
  setMuted(muted: boolean): void
  unlock(): void
  suspend(): void
  resume(): void
  tone(freq: number, durationMs: number, type?: OscillatorType, gain?: number): void
  blip(): void
  step(): void
  eat(): void
  hit(): void
  break_(): void
  powerUp(): void
  flag(): void
  gameOver(): void
  win(): void
}

type Ctor = typeof AudioContext

function audioContextCtor(): Ctor | null {
  const w = window as Window & { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function createSfx(initialMuted = false): Sfx {
  let context: AudioContext | null = null
  let muted = initialMuted
  let master: GainNode | null = null

  function ensure(): AudioContext | null {
    if (context) return context
    const Ctor = audioContextCtor()
    if (!Ctor) return null
    try {
      context = new Ctor()
      master = context.createGain()
      master.gain.value = 0.5
      master.connect(context.destination)
    } catch {
      context = null
    }
    return context
  }

  function tone(freq: number, durationMs: number, type: OscillatorType = 'square', gain = 0.25): void {
    if (muted) return
    const ctx = ensure()
    if (!ctx || !master) return
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
    osc.connect(env)
    env.connect(master)
    osc.start(now)
    osc.stop(now + durationMs / 1000 + 0.02)
  }

  function sweep(from: number, to: number, durationMs: number, type: OscillatorType = 'sawtooth'): void {
    if (muted) return
    const ctx = ensure()
    if (!ctx || !master) return
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + durationMs / 1000)
    env.gain.setValueAtTime(0.22, now)
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
    osc.connect(env)
    env.connect(master)
    osc.start(now)
    osc.stop(now + durationMs / 1000 + 0.02)
  }

  return {
    get muted() {
      return muted
    },
    setMuted(next: boolean) {
      muted = next
    },
    unlock() {
      const ctx = ensure()
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    },
    suspend() {
      if (context && context.state === 'running') void context.suspend()
    },
    resume() {
      if (context && context.state === 'suspended') void context.resume()
    },
    tone,
    blip() {
      tone(660, 60, 'square', 0.2)
    },
    step() {
      tone(220, 45, 'triangle', 0.18)
    },
    eat() {
      tone(880, 70, 'square', 0.22)
      setTimeout(() => tone(1320, 70, 'square', 0.18), 55)
    },
    hit() {
      tone(160, 90, 'square', 0.24)
    },
    break_() {
      tone(520, 70, 'square', 0.2)
    },
    powerUp() {
      sweep(320, 1200, 220)
    },
    flag() {
      tone(990, 50, 'sine', 0.2)
    },
    gameOver() {
      sweep(440, 90, 550, 'sawtooth')
    },
    win() {
      ;[523, 659, 784, 1046].forEach((freq, index) => {
        setTimeout(() => tone(freq, 140, 'square', 0.2), index * 110)
      })
    },
  }
}
