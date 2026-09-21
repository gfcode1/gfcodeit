import type { GameHooks, GameInstance } from '../engine/types'

const VW = 180
const VH = 320
const GRAVITY = 620
const FLAP = -235
const PIPE_W = 44
const PIPE_GAP = 96
const SPEED = 108
const SPACING = 150
const BIRD_X = 48
const BIRD_R = 11

interface Pipe {
  x: number
  gapY: number
  scored: boolean
}

export function create(hooks: GameHooks): GameInstance {
  let birdY = 140
  let velocity = 0
  let pipes: Pipe[] = []
  let score = 0
  let dead = false
  let started = false
  let distanceUntilPipe = 90
  let flapFrame = 0

  function reset(): void {
    birdY = 140
    velocity = 0
    pipes = []
    score = 0
    dead = false
    started = false
    distanceUntilPipe = 90
  }

  function flap(): void {
    if (dead) return
    started = true
    velocity = FLAP
    flapFrame = 0.12
    hooks.audio.blip()
  }

  function spawnPipe(): void {
    const margin = 54
    const gapY = margin + Math.random() * (VH - margin * 2 - PIPE_GAP)
    pipes.push({ x: VW + PIPE_W, gapY, scored: false })
  }

  function die(): void {
    if (dead) return
    dead = true
    hooks.audio.hit()
    hooks.gameOver(score)
  }

  reset()

  return {
    update(dt) {
      if (flapFrame > 0) flapFrame -= dt
      velocity += GRAVITY * dt
      birdY += velocity * dt

      if (birdY + BIRD_R >= VH - 12) {
        birdY = VH - 12 - BIRD_R
        die()
        return
      }
      if (birdY - BIRD_R < 0) {
        birdY = BIRD_R
        velocity = 0
      }

      if (started) {
        distanceUntilPipe -= SPEED * dt
        if (distanceUntilPipe <= 0) {
          spawnPipe()
          distanceUntilPipe = SPACING
        }
        for (const pipe of pipes) {
          pipe.x -= SPEED * dt
          if (!pipe.scored && pipe.x + PIPE_W < BIRD_X - BIRD_R) {
            pipe.scored = true
            score += 1
            hooks.setScore(score)
            hooks.audio.step()
          }
          const withinX = BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_W
          const withinGap = birdY - BIRD_R > pipe.gapY && birdY + BIRD_R < pipe.gapY + PIPE_GAP
          if (withinX && !withinGap) {
            die()
            return
          }
        }
        pipes = pipes.filter((pipe) => pipe.x + PIPE_W > -10)
      }
    },
    onKey(action, down) {
      if (action === 'a' && down) flap()
    },
    onPointer(input) {
      if (input.action === 'down') flap()
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      const sky = ctx.createLinearGradient(0, 0, 0, VH)
      sky.addColorStop(0, '#1b2a4a')
      sky.addColorStop(1, '#3d6ea8')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, VW, VH)

      for (const pipe of pipes) {
        ctx.fillStyle = '#2f9e44'
        ctx.fillRect(pipe.x, 0, PIPE_W, pipe.gapY)
        ctx.fillRect(pipe.x, pipe.gapY + PIPE_GAP, PIPE_W, VH - pipe.gapY - PIPE_GAP)
        ctx.fillStyle = '#40c057'
        ctx.fillRect(pipe.x - 3, pipe.gapY - 14, PIPE_W + 6, 14)
        ctx.fillRect(pipe.x - 3, pipe.gapY + PIPE_GAP, PIPE_W + 6, 14)
      }

      ctx.fillStyle = '#5c4033'
      ctx.fillRect(0, VH - 12, VW, 12)

      const tilt = Math.max(-0.5, Math.min(0.9, velocity / 400))
      ctx.save()
      ctx.translate(BIRD_X, birdY)
      ctx.rotate(tilt)
      ctx.fillStyle = '#ffd43b'
      ctx.beginPath()
      ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff922b'
      ctx.beginPath()
      const wing = flapFrame > 0 ? -5 : 4
      ctx.ellipse(-3, wing, 6, 3.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1a1a1a'
      ctx.beginPath()
      ctx.arc(4, -4, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.restore()
    },
  }
}
