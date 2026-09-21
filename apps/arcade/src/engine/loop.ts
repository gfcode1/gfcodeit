const STEP = 1 / 60
const MAX_FRAME = 0.25

export interface Loop {
  start(): void
  pause(): void
  resume(): void
  stop(): void
  readonly running: boolean
  readonly paused: boolean
}

export function createLoop(update: (dt: number) => void, render: () => void): Loop {
  let raf = 0
  let last = 0
  let acc = 0
  let running = false
  let paused = false

  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    if (paused) {
      last = now
      return
    }
    const elapsed = last === 0 ? STEP : (now - last) / 1000
    last = now
    acc += Math.min(elapsed, MAX_FRAME)
    let guard = 0
    while (acc >= STEP && guard < 8) {
      update(STEP)
      acc -= STEP
      guard += 1
    }
    if (guard >= 8) acc = 0
    render()
  }

  return {
    start() {
      if (running) return
      running = true
      paused = false
      last = 0
      acc = 0
      raf = requestAnimationFrame(frame)
    },
    pause() {
      if (!running) return
      paused = true
    },
    resume() {
      if (!running) return
      paused = false
      last = 0
      acc = 0
    },
    stop() {
      running = false
      paused = false
      cancelAnimationFrame(raf)
    },
    get running() {
      return running
    },
    get paused() {
      return paused
    },
  }
}
