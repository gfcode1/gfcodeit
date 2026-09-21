import type { GameHooks, GameInstance } from '../engine/types'

const VW = 200
const VH = 140
const PADDLE_W = 6
const PADDLE_H = 28
const BALL_R = 4
const SOLID = 2
const MAX_LIVES = 3

export function create(hooks: GameHooks): GameInstance {
  let playerY = VH / 2
  let cpuY = VH / 2
  let ballX = VW / 2
  let ballY = VH / 2
  let vx = 150
  let vy = 90
  let score = 0
  let lives = MAX_LIVES
  let dead = false
  let up = false
  let down = false
  let serveTimer = 0.8
  let flashPlayer = 0
  let flashCpu = 0

  function resetBall(direction: number): void {
    ballX = VW / 2
    ballY = VH / 2
    const speed = 150 + score * 6
    vx = Math.min(320, speed) * direction
    vy = (Math.random() * 2 - 1) * speed * 0.6
    serveTimer = 0.6
  }

  function playerLoses(): void {
    lives -= 1
    flashPlayer = 0.25
    hooks.audio.hit()
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
      return
    }
    resetBall(-1)
  }

  function playerScores(): void {
    score += 1
    flashCpu = 0.25
    hooks.setScore(score)
    hooks.audio.blip()
    resetBall(1)
  }

  function paddleSpeed(): number {
    return Math.min(210, 130 + score * 8)
  }

  return {
    update(dt) {
      if (dead) return
      if (flashPlayer > 0) flashPlayer -= dt
      if (flashCpu > 0) flashCpu -= dt

      if (up) playerY -= 220 * dt
      if (down) playerY += 220 * dt
      playerY = Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, playerY))

      const target = ballY
      const diff = target - cpuY
      const maxStep = paddleSpeed() * dt
      cpuY += Math.max(-maxStep, Math.min(maxStep, diff))
      cpuY = Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, cpuY))

      if (serveTimer > 0) {
        serveTimer -= dt
        return
      }

      ballX += vx * dt
      ballY += vy * dt

      if (ballY - BALL_R < 0) {
        ballY = BALL_R
        vy = Math.abs(vy)
      } else if (ballY + BALL_R > VH) {
        ballY = VH - BALL_R
        vy = -Math.abs(vy)
      }

      const playerFace = SOLID + PADDLE_W
      const cpuFace = VW - SOLID - PADDLE_W

      if (vx < 0 && ballX - BALL_R <= playerFace && ballX + BALL_R >= SOLID) {
        if (ballY > playerY - PADDLE_H / 2 && ballY < playerY + PADDLE_H / 2) {
          const hit = (ballY - playerY) / (PADDLE_H / 2)
          const mag = Math.min(320, Math.hypot(vx, vy) * 1.05)
          vx = Math.abs(mag * 0.86)
          vy = hit * mag * 0.6
          ballX = playerFace + BALL_R
          hooks.audio.step()
        }
      } else if (vx > 0 && ballX + BALL_R >= cpuFace && ballX - BALL_R <= cpuFace + PADDLE_W) {
        if (ballY > cpuY - PADDLE_H / 2 && ballY < cpuY + PADDLE_H / 2) {
          const hit = (ballY - cpuY) / (PADDLE_H / 2)
          const mag = Math.min(320, Math.hypot(vx, vy) * 1.05)
          vx = -Math.abs(mag * 0.86)
          vy = hit * mag * 0.6
          ballX = cpuFace - BALL_R
          hooks.audio.step()
        }
      }

      if (ballX < -BALL_R * 2) playerLoses()
      else if (ballX > VW + BALL_R * 2) playerScores()
    },
    onKey(action, down) {
      if (action === 'up') up = down
      else if (action === 'down') down = down
    },
    onPointer(input) {
      if (input.action === 'up') return
      const world = (input.y / input.height) * VH
      playerY = Math.max(PADDLE_H / 2, Math.min(VH - PADDLE_H / 2, world))
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, 0, VW, VH)

      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.setLineDash([6, 8])
      ctx.beginPath()
      ctx.moveTo(VW / 2, 0)
      ctx.lineTo(VW / 2, VH)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = flashPlayer > 0 ? '#ff6b6b' : '#a5d8ff'
      ctx.fillRect(SOLID, playerY - PADDLE_H / 2, PADDLE_W, PADDLE_H)
      ctx.fillStyle = flashCpu > 0 ? '#ffd43b' : '#ff8787'
      ctx.fillRect(VW - SOLID - PADDLE_W, cpuY - PADDLE_H / 2, PADDLE_W, PADDLE_H)

      ctx.fillStyle = '#f8f9fa'
      ctx.beginPath()
      ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(248,249,250,0.28)'
      ctx.fillText(String(score), VW / 2 - 26, 26)
      ctx.fillText(String(MAX_LIVES - lives), VW / 2 + 26, 26)

      ctx.restore()
    },
  }
}
