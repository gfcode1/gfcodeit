import type { GameHooks, GameInstance } from '../engine/types'

const VW = 140
const VH = 200
const PADDLE_W = 36
const PADDLE_H = 6
const PADDLE_Y = VH - 16
const BALL_R = 4
const COLS = 8
const ROWS = 5
const MARGIN = 8
const GAP = 3
const TOP = 34
const BRICK_H = 9

interface Brick {
  x: number
  y: number
  w: number
  alive: boolean
}

export function create(hooks: GameHooks): GameInstance {
  let paddleX = VW / 2
  let ballX = VW / 2
  let ballY = PADDLE_Y - BALL_R - 1
  let vx = 0
  let vy = 0
  let launched = false
  let lives = 3
  let score = 0
  let level = 1
  let speed = 158
  let bricks: Brick[] = []
  let dead = false
  let left = false
  let right = false
  let flash = 0

  const brickW = (VW - MARGIN * 2 - GAP * (COLS - 1)) / COLS

  function buildBricks(): void {
    bricks = []
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        bricks.push({ x: MARGIN + col * (brickW + GAP), y: TOP + row * (BRICK_H + GAP), w: brickW, alive: true })
      }
    }
  }

  function serve(): void {
    launched = false
    ballX = paddleX
    ballY = PADDLE_Y - BALL_R - 1
    vx = 0
    vy = 0
  }

  function launch(): void {
    if (dead || launched) return
    launched = true
    const angle = (Math.random() * 0.7 - 0.35)
    vx = Math.sin(angle) * speed
    vy = -Math.cos(angle) * speed
    hooks.audio.blip()
  }

  function loseLife(): void {
    lives -= 1
    hooks.audio.hit()
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
      return
    }
    serve()
  }

  buildBricks()

  return {
    update(dt) {
      if (dead) return
      if (flash > 0) flash -= dt
      if (left) paddleX -= 190 * dt
      if (right) paddleX += 190 * dt
      paddleX = Math.max(PADDLE_W / 2, Math.min(VW - PADDLE_W / 2, paddleX))

      if (!launched) {
        ballX = paddleX
        return
      }

      ballX += vx * dt
      ballY += vy * dt

      if (ballX - BALL_R < 0) {
        ballX = BALL_R
        vx = Math.abs(vx)
      } else if (ballX + BALL_R > VW) {
        ballX = VW - BALL_R
        vx = -Math.abs(vx)
      }
      if (ballY - BALL_R < 0) {
        ballY = BALL_R
        vy = Math.abs(vy)
      }

      if (vy > 0 && ballY + BALL_R >= PADDLE_Y && ballY - BALL_R <= PADDLE_Y + PADDLE_H) {
        if (ballX > paddleX - PADDLE_W / 2 - BALL_R && ballX < paddleX + PADDLE_W / 2 + BALL_R) {
          const hit = (ballX - paddleX) / (PADDLE_W / 2)
          const angle = hit * 1.05
          const mag = Math.hypot(vx, vy)
          vx = Math.sin(angle) * mag
          vy = -Math.abs(Math.cos(angle) * mag)
          hooks.audio.step()
        }
      }

      if (ballY - BALL_R > VH) {
        loseLife()
        return
      }

      for (const brick of bricks) {
        if (!brick.alive) continue
        if (
          ballX + BALL_R > brick.x &&
          ballX - BALL_R < brick.x + brick.w &&
          ballY + BALL_R > brick.y &&
          ballY - BALL_R < brick.y + BRICK_H
        ) {
          brick.alive = false
          score += 10
          hooks.setScore(score)
          hooks.audio.break_()
          flash = 0.08
          const overlapX = Math.min(ballX + BALL_R - brick.x, brick.x + brick.w - (ballX - BALL_R))
          const overlapY = Math.min(ballY + BALL_R - brick.y, brick.y + BRICK_H - (ballY - BALL_R))
          if (overlapX < overlapY) vx = -vx
          else vy = -vy
          break
        }
      }

      if (!bricks.some((brick) => brick.alive)) {
        level += 1
        speed = Math.min(280, speed + 22)
        hooks.audio.win()
        buildBricks()
        serve()
      }
    },
    onKey(action, down) {
      if (action === 'left') left = down
      else if (action === 'right') right = down
      else if (action === 'a' && down) launch()
    },
    onPointer(input) {
      const world = (input.x / input.width) * VW
      if (input.action === 'down') {
        launch()
      }
      paddleX = Math.max(PADDLE_W / 2, Math.min(VW - PADDLE_W / 2, world))
      if (!launched) ballX = paddleX
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, VW, VH)

      bricks.forEach((brick) => {
        if (!brick.alive) return
        ctx.fillStyle = flash > 0 ? '#ffe066' : ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#4dabf7'][Math.floor(brick.y / 10) % 5] as string
        ctx.fillRect(brick.x, brick.y, brick.w, BRICK_H)
      })

      ctx.fillStyle = '#e9ecef'
      ctx.fillRect(paddleX - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H)

      ctx.fillStyle = '#a5d8ff'
      ctx.beginPath()
      ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(233,236,239,0.55)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`LV ${level}`, 8, 16)
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), VW - 8, 16)

      ctx.restore()
    },
  }
}
