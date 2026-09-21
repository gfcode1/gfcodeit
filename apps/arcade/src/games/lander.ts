import type { GameHooks, GameInstance } from '../engine/types'
import { clamp, randInt } from '../engine/format'

const VW = 160
const VH = 120
const POINTS = 33
const GRAVITY_BASE = 20
const THRUST = 52
const ROTATION = 2.8
const LANDER_R = 4
const FUEL_MAX = 100

export function create(hooks: GameHooks): GameInstance {
  const step = VW / (POINTS - 1)
  const stars = Array.from({ length: 40 }, () => ({
    x: Math.random() * VW,
    y: Math.random() * VH * 0.7,
    a: 0.2 + Math.random() * 0.6,
  }))

  let heights: number[] = []
  let padStart = 0
  let padEnd = 0
  let gravity = GRAVITY_BASE
  let lander = { x: VW / 2, y: 12, vx: 0, vy: 0, angle: 0 }
  let fuel = FUEL_MAX
  let score = 0
  let level = 1
  let thrusting = false
  let left = false
  let right = false
  let dead = false
  let successTimer = 0

  function buildTerrain(): void {
    heights = Array.from({ length: POINTS }, () => 14 + Math.random() * 30)
    padStart = randInt(7, POINTS - 11)
    padEnd = padStart + 3
    for (let i = padStart; i <= padEnd; i += 1) heights[i] = 16
  }

  function terrainY(x: number): number {
    const clamped = clamp(x, 0, VW)
    const index = clamped / step
    const i0 = Math.floor(index)
    const i1 = Math.min(POINTS - 1, i0 + 1)
    const frac = index - i0
    const h = (heights[i0] ?? 16) + ((heights[i1] ?? 16) - (heights[i0] ?? 16)) * frac
    return VH - h
  }

  function onPad(x: number): boolean {
    return x >= padStart * step && x <= padEnd * step
  }

  function resetLander(): void {
    lander = {
      x: 20 + Math.random() * (VW - 40),
      y: 12,
      vx: Math.random() * 16 - 8,
      vy: 0,
      angle: 0,
    }
    fuel = FUEL_MAX
    thrusting = false
  }

  function nextLevel(): void {
    level += 1
    gravity = GRAVITY_BASE + (level - 1) * 1.6
    buildTerrain()
    resetLander()
    hooks.audio.powerUp()
  }

  function land(): void {
    const speed = Math.abs(lander.vy)
    const lateral = Math.abs(lander.vx)
    const tilt = Math.abs(lander.angle)
    const soft = onPad(lander.x) && speed < 24 && lateral < 14 && tilt < 0.22
    if (soft) {
      score += 400 + Math.floor(fuel) * 4 + Math.floor((24 - speed) * 5)
      hooks.setScore(score)
      hooks.audio.win()
      successTimer = 1.1
    } else {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
    }
  }

  buildTerrain()
  resetLander()

  return {
    update(dt) {
      if (successTimer > 0) {
        successTimer -= dt
        if (successTimer <= 0) nextLevel()
        return
      }
      if (dead) return

      if (left) lander.angle -= ROTATION * dt
      if (right) lander.angle += ROTATION * dt
      lander.angle = clamp(lander.angle, -1.2, 1.2)

      if (thrusting && fuel > 0) {
        lander.vx += Math.sin(lander.angle) * THRUST * dt
        lander.vy += -Math.cos(lander.angle) * THRUST * dt
        fuel = Math.max(0, fuel - 22 * dt)
      }

      lander.vy += gravity * dt
      lander.x += lander.vx * dt
      lander.y += lander.vy * dt

      if (lander.x < LANDER_R) {
        lander.x = LANDER_R
        lander.vx = 0
        if (Math.abs(lander.vy) > 24) land()
      } else if (lander.x > VW - LANDER_R) {
        lander.x = VW - LANDER_R
        lander.vx = 0
        if (Math.abs(lander.vy) > 24) land()
      }
      if (lander.y < LANDER_R) {
        lander.y = LANDER_R
        lander.vy = Math.max(0, lander.vy)
      }

      if (lander.y + LANDER_R >= terrainY(lander.x)) {
        lander.y = terrainY(lander.x) - LANDER_R
        land()
      }
    },
    onKey(action, down) {
      if (action === 'up' || action === 'a') thrusting = down
      else if (action === 'left') left = down
      else if (action === 'right') right = down
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      ctx.fillStyle = '#07080d'
      ctx.fillRect(0, 0, VW, VH)
      for (const star of stars) {
        ctx.fillStyle = `rgba(255,255,255,${star.a})`
        ctx.fillRect(star.x, star.y, 1, 1)
      }

      ctx.beginPath()
      ctx.moveTo(0, VH)
      for (let i = 0; i < POINTS; i += 1) {
        ctx.lineTo(i * step, VH - (heights[i] as number))
      }
      ctx.lineTo(VW, VH)
      ctx.closePath()
      ctx.fillStyle = '#4a4e69'
      ctx.fill()

      ctx.strokeStyle = '#8d99ae'
      ctx.beginPath()
      for (let i = 0; i < POINTS; i += 1) {
        const x = i * step
        const y = VH - (heights[i] as number)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      ctx.strokeStyle = '#51cf66'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(padStart * step, VH - 16)
      ctx.lineTo(padEnd * step, VH - 16)
      ctx.stroke()
      ctx.lineWidth = 1

      if (successTimer <= 0) {
        ctx.save()
        ctx.translate(lander.x, lander.y)
        ctx.rotate(lander.angle)
        if (thrusting && fuel > 0) {
          ctx.fillStyle = 'rgba(255,146,43,0.9)'
          ctx.beginPath()
          ctx.moveTo(-3, LANDER_R + 1)
          ctx.lineTo(3, LANDER_R + 1)
          ctx.lineTo(0, LANDER_R + 7)
          ctx.closePath()
          ctx.fill()
        }
        ctx.fillStyle = '#dee2e6'
        ctx.beginPath()
        ctx.moveTo(0, -LANDER_R - 2)
        ctx.lineTo(LANDER_R, LANDER_R)
        ctx.lineTo(-LANDER_R, LANDER_R)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#adb5bd'
        ctx.beginPath()
        ctx.moveTo(-LANDER_R, LANDER_R)
        ctx.lineTo(-LANDER_R - 3, LANDER_R + 3)
        ctx.moveTo(LANDER_R, LANDER_R)
        ctx.lineTo(LANDER_R + 3, LANDER_R + 3)
        ctx.stroke()
        ctx.restore()
      }

      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`LV ${level}`, 6, 12)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(VW - 46, 6, 40, 5)
      ctx.fillStyle = fuel > 25 ? '#51cf66' : '#ff6b6b'
      ctx.fillRect(VW - 46, 6, (fuel / FUEL_MAX) * 40, 5)
      ctx.restore()
    },
  }
}
