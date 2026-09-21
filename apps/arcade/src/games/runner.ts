import type { GameHooks, GameInstance } from '../engine/types'

const VW = 200
const VH = 125
const GROUND = VH - 20
const GRAVITY = 1200
const JUMP = -430
const PLAYER_X = 30
const STAND_H = 22
const DUCK_H = 12

interface Obstacle {
  x: number
  w: number
  h: number
  y: number
  flying: boolean
}

export function create(hooks: GameHooks): GameInstance {
  let playerY = GROUND
  let vy = 0
  let ducking = false
  let obstacles: Obstacle[] = []
  let distance = 0
  let score = 0
  let dead = false
  let spawnGap = 90
  let nextSpawn = VW * 0.8

  function speed(): number {
    return Math.min(270, 115 + distance * 0.02)
  }

  function jump(): void {
    if (dead || playerY < GROUND - 0.5) return
    vy = JUMP
    hooks.audio.blip()
  }

  function spawn(): void {
    const flying = Math.random() < 0.35 && score > 5
    if (flying) {
      obstacles.push({ x: VW + 12, w: 18, h: 14, y: GROUND - 34, flying: true })
    } else {
      const h = 18 + Math.random() * 12
      obstacles.push({ x: VW + 12, w: 14 + Math.random() * 10, h, y: GROUND - h, flying: false })
    }
    spawnGap = Math.max(58, 118 - speed() * 0.16) + Math.random() * 40
    nextSpawn = spawnGap
  }

  function playerBox(): { x: number; y: number; w: number; h: number } {
    const height = ducking ? DUCK_H : STAND_H
    return { x: PLAYER_X - 6, y: playerY - height, w: 12, h: height }
  }

  function overlaps(a: { x: number; y: number; w: number; h: number }, b: Obstacle): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  }

  return {
    update(dt) {
      if (dead) return
      const spd = speed()
      distance += spd * dt
      const nextScore = Math.floor(distance / 10)
      if (nextScore !== score) {
        score = nextScore
        hooks.setScore(score)
        if (score % 10 === 0) hooks.audio.step()
      }

      vy += GRAVITY * dt
      playerY += vy * dt
      if (playerY >= GROUND) {
        playerY = GROUND
        vy = 0
      }

      nextSpawn -= spd * dt
      if (nextSpawn <= 0 && (obstacles.length === 0 || (obstacles[obstacles.length - 1] as Obstacle).x < VW - 50)) {
        spawn()
      }

      for (const obstacle of obstacles) obstacle.x -= spd * dt
      obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -4)

      const box = playerBox()
      for (const obstacle of obstacles) {
        if (overlaps(box, obstacle)) {
          dead = true
          hooks.audio.gameOver()
          hooks.gameOver(score)
          break
        }
      }
    },
    onKey(action, down) {
      if (action === 'up' || action === 'a') {
        if (down) jump()
        return
      }
      if (action === 'down') {
        ducking = down
      }
    },
    onPointer(input) {
      if (input.action !== 'down') return
      if (input.y > input.height * 0.55) ducking = true
      else jump()
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      const sky = ctx.createLinearGradient(0, 0, 0, VH)
      sky.addColorStop(0, '#1d3557')
      sky.addColorStop(1, '#457b9d')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, VW, VH)

      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      const drift = (distance * 0.35) % (VW + 60)
      for (let i = 0; i < 3; i += 1) {
        const cx = VW + 30 - ((drift + i * 80) % (VW + 120))
        ctx.beginPath()
        ctx.arc(cx, 30 + i * 16, 12, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#3d2b1f'
      ctx.fillRect(0, GROUND, VW, VH - GROUND)
      ctx.fillStyle = '#5c4033'
      ctx.fillRect(0, GROUND, VW, 3)

      for (const obstacle of obstacles) {
        ctx.fillStyle = obstacle.flying ? '#ff6b6b' : '#2f9e44'
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
      }

      const box = playerBox()
      ctx.fillStyle = dead ? '#868e96' : '#ffd43b'
      ctx.fillRect(box.x, box.y, box.w, box.h)
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(box.x + box.w - 4, box.y + 3, 2, 2)

      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.floor(distance)} m`, VW - 8, 15)
      ctx.restore()
    },
  }
}
