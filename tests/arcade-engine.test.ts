import { afterEach, describe, expect, it, vi } from 'vitest'
import { clamp, lerp, pad, randInt, shuffle } from '../apps/arcade/src/engine/format'
import { detectSwipe, dpadActions, KEY_ACTIONS, OPPOSITE_ACTION, PAUSE_KEYS } from '../apps/arcade/src/engine/input'
import type { GameHooks } from '../apps/arcade/src/engine/types'
import { CATALOG } from '../apps/arcade/src/games'
import * as flappy from '../apps/arcade/src/games/flappy'
import * as runner from '../apps/arcade/src/games/runner'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeHooks(): { hooks: GameHooks; gameOver: ReturnType<typeof vi.fn>; setScore: ReturnType<typeof vi.fn> } {
  const gameOver = vi.fn()
  const setScore = vi.fn()
  const hooks: GameHooks = {
    audio: {
      muted: false,
      setMuted() {},
      unlock() {},
      suspend() {},
      resume() {},
      tone() {},
      blip() {},
      step() {},
      eat() {},
      hit() {},
      break_() {},
      powerUp() {},
      flag() {},
      gameOver() {},
      win() {},
    },
    best: 0,
    setScore,
    gameOver,
    requestPause() {},
  }
  return { hooks, gameOver, setScore }
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; rects: number[][] } {
  const rects: number[][] = []
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: '',
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    fillText() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
    fillRect(...args: number[]) {
      rects.push(args)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, rects }
}

describe('format helpers', () => {
  it('clamps and interpolates', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(lerp(0, 10, 0.5)).toBe(5)
  })

  it('pads scores', () => {
    expect(pad(7, 4)).toBe('0007')
    expect(pad(-3, 2)).toBe('00')
  })

  it('randInt stays within the inclusive range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(randInt(1, 6)).toBe(1)
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(randInt(1, 6)).toBe(6)
  })

  it('shuffle preserves the elements', () => {
    const result = shuffle([1, 2, 3, 4, 5])
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('input helpers', () => {
  it('maps keys to actions', () => {
    expect(KEY_ACTIONS.ArrowUp).toBe('up')
    expect(KEY_ACTIONS.Space).toBe('a')
    expect(PAUSE_KEYS.has('Escape')).toBe(true)
  })

  it('detects swipes above the threshold only', () => {
    expect(detectSwipe(0, 0, 5, 5)).toBeNull()
    expect(detectSwipe(0, 0, 100, 5)).toEqual({ action: 'right' })
    expect(detectSwipe(100, 0, 0, 0)).toEqual({ action: 'left' })
    expect(detectSwipe(0, 0, 0, 100)).toEqual({ action: 'down' })
    expect(detectSwipe(0, 100, 0, 0)).toEqual({ action: 'up' })
  })

  it('resolves dpad layouts', () => {
    expect(dpadActions('lr')).toEqual(['left', 'right'])
    expect(dpadActions('ud')).toEqual(['up', 'down'])
    expect(dpadActions(false)).toEqual([])
    expect(dpadActions(undefined)).toEqual(['up', 'down', 'left', 'right'])
  })

  it('maps each direction to its opposite for held-input release', () => {
    expect(OPPOSITE_ACTION.up).toBe('down')
    expect(OPPOSITE_ACTION.down).toBe('up')
    expect(OPPOSITE_ACTION.left).toBe('right')
    expect(OPPOSITE_ACTION.right).toBe('left')
    expect(OPPOSITE_ACTION.a).toBeUndefined()
  })
})

describe('arcade catalog', () => {
  it('does not render a dead d-pad for pointer-only games', () => {
    const flappyEntry = CATALOG.find((entry) => entry.meta.id === 'flappy')
    expect(flappyEntry?.meta.controls.dpad).toBe(false)
  })
})

describe('flappy', () => {
  it('hovers until the first flap instead of falling to its death', () => {
    const { hooks, gameOver } = makeHooks()
    const game = flappy.create(hooks)
    for (let i = 0; i < 600; i += 1) game.update(1 / 60)
    expect(gameOver).not.toHaveBeenCalled()

    game.onKey?.('a', true)
    for (let i = 0; i < 600; i += 1) game.update(1 / 60)
    expect(gameOver).toHaveBeenCalled()
  })
})

describe('runner', () => {
  it('releases the duck when the pointer lifts', () => {
    const { hooks } = makeHooks()
    const game = runner.create(hooks)

    const playerHeight = (): number => {
      const { ctx, rects } = recordingCtx()
      game.render(ctx, 200, 125)
      const box = rects.find((rect) => rect[2] === 12)
      return box ? box[3]! : -1
    }

    expect(playerHeight()).toBe(22)
    game.onPointer?.({ x: 0, y: 100, width: 200, height: 125, action: 'down' })
    expect(playerHeight()).toBe(12)
    game.onPointer?.({ x: 0, y: 100, width: 200, height: 125, action: 'up' })
    expect(playerHeight()).toBe(22)
  })
})
