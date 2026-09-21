import type { GameHooks, GameInstance } from '../engine/types'

const VW = 180
const VH = 240
const ROWS = 5
const COLS = 8
const ALIEN_W = 14
const ALIEN_H = 10
const GAP_X = 4
const GAP_Y = 6
const MAX_LIVES = 3
const POINTS = [30, 25, 20, 15, 10]

interface Bullet {
  x: number
  y: number
}

export function create(hooks: GameHooks): GameInstance {
  const formationW = COLS * ALIEN_W + (COLS - 1) * GAP_X
  const baseX = (VW - formationW) / 2
  const baseY = 30

  const alive: boolean[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true))
  let originX = baseX
  let originY = baseY
  let direction = 1
  let playerX = VW / 2
  let bullets: Bullet[] = []
  let alienBullets: Bullet[] = []
  let cooldown = 0
  let alienFire = 1.2
  let lives = MAX_LIVES
  let score = 0
  let wave = 1
  let invulnerable = 1.2
  let dead = false
  let left = false
  let right = false

  const playerY = VH - 26

  function alienX(col: number): number {
    return originX + col * (ALIEN_W + GAP_X)
  }

  function alienY(row: number): number {
    return originY + row * (ALIEN_H + GAP_Y)
  }

  function rebuild(): void {
    for (const row of alive) row.fill(true)
    originX = baseX
    originY = baseY
    direction = 1
    bullets = []
    alienBullets = []
    alienFire = Math.max(0.4, 1.2 - wave * 0.12)
  }

  function speed(): number {
    return 16 + wave * 4 + (ROWS * COLS - remaining()) * 0.6
  }

  function remaining(): number {
    let count = 0
    for (const row of alive) for (const cell of row) if (cell) count += 1
    return count
  }

  function loseLife(): void {
    if (invulnerable > 0 || dead) return
    lives -= 1
    hooks.audio.hit()
    alienBullets = []
    playerX = VW / 2
    invulnerable = 1.6
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
    }
  }

  function fire(): void {
    if (cooldown > 0 || dead) return
    cooldown = 0.3
    bullets.push({ x: playerX, y: playerY - 6 })
    hooks.audio.blip()
  }

  return {
    update(dt) {
      if (dead) return
      if (cooldown > 0) cooldown -= dt
      if (invulnerable > 0) invulnerable -= dt

      if (left) playerX -= 145 * dt
      if (right) playerX += 145 * dt
      playerX = Math.max(ALIEN_W / 2 + 4, Math.min(VW - ALIEN_W / 2 - 4, playerX))

      // Formation marching.
      let minCol = COLS
      let maxCol = -1
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (alive[row]![col]) {
            minCol = Math.min(minCol, col)
            maxCol = Math.max(maxCol, col)
          }
        }
      }
      if (maxCol >= 0) {
        const step = direction * speed() * dt
        originX += step
        const leftEdge = alienX(minCol)
        const rightEdge = alienX(maxCol) + ALIEN_W
        if (leftEdge < 6 && direction < 0) {
          direction = 1
          originY += 8
          hooks.audio.step()
        } else if (rightEdge > VW - 6 && direction > 0) {
          direction = -1
          originY += 8
          hooks.audio.step()
        }
      }

      for (const bullet of bullets) bullet.y -= 260 * dt
      bullets = bullets.filter((bullet) => bullet.y > -4)

      alienFire -= dt
      if (alienFire <= 0 && maxCol >= 0) {
        alienFire = Math.max(0.3, 0.95 - wave * 0.08 - score * 0.001)
        const column = Math.floor(Math.random() * COLS)
        for (let row = ROWS - 1; row >= 0; row -= 1) {
          if (alive[row]![column]) {
            alienBullets.push({ x: alienX(column) + ALIEN_W / 2, y: alienY(row) + ALIEN_H })
            break
          }
        }
      }
      for (const bullet of alienBullets) bullet.y += 105 * dt
      alienBullets = alienBullets.filter((bullet) => bullet.y < VH + 4)

      for (let b = bullets.length - 1; b >= 0; b -= 1) {
        const bullet = bullets[b] as Bullet
        let hit = false
        for (let row = 0; row < ROWS && !hit; row += 1) {
          for (let col = 0; col < COLS; col += 1) {
            if (!alive[row]![col]) continue
            const x = alienX(col)
            const y = alienY(row)
            if (bullet.x > x && bullet.x < x + ALIEN_W && bullet.y < y + ALIEN_H && bullet.y > y) {
              alive[row]![col] = false
              bullets.splice(b, 1)
              score += POINTS[row] as number
              hooks.setScore(score)
              hooks.audio.break_()
              hit = true
              break
            }
          }
        }
      }

      for (let b = alienBullets.length - 1; b >= 0; b -= 1) {
        const bullet = alienBullets[b] as Bullet
        if (
          bullet.x > playerX - ALIEN_W / 2 &&
          bullet.x < playerX + ALIEN_W / 2 &&
          bullet.y > playerY - 8 &&
          bullet.y < playerY + 8
        ) {
          alienBullets.splice(b, 1)
          loseLife()
        }
      }

      // Aliens reaching the player's row ends the run.
      if (maxCol >= 0) {
        for (let col = 0; col < COLS; col += 1) {
          for (let row = ROWS - 1; row >= 0; row -= 1) {
            if (alive[row]![col]) {
              if (alienY(row) + ALIEN_H >= playerY - 6) {
                dead = true
                hooks.audio.gameOver()
                hooks.gameOver(score)
              }
              break
            }
          }
        }
      }

      if (remaining() === 0 && !dead) {
        wave += 1
        hooks.audio.powerUp()
        rebuild()
      }
    },
    onKey(action, down) {
      if (action === 'left') left = down
      else if (action === 'right') right = down
      else if ((action === 'a' || action === 'b') && down) fire()
    },
    render(ctx, width, height) {
      const scale = Math.min(width / VW, height / VH)
      ctx.save()
      ctx.translate((width - VW * scale) / 2, (height - VH * scale) / 2)
      ctx.scale(scale, scale)

      ctx.fillStyle = '#07080d'
      ctx.fillRect(0, 0, VW, VH)

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (!alive[row]![col]) continue
          const x = alienX(col)
          const y = alienY(row)
          ctx.fillStyle = ['#ff6b6b', '#ffd43b', '#51cf66', '#4dabf7', '#cc5de8'][row] as string
          ctx.fillRect(x, y, ALIEN_W, ALIEN_H)
          ctx.fillStyle = '#07080d'
          ctx.fillRect(x + 3, y + 3, 2, 2)
          ctx.fillRect(x + ALIEN_W - 5, y + 3, 2, 2)
          ctx.fillRect(x + 2, y + ALIEN_H - 2, ALIEN_W - 4, 1)
        }
      }

      ctx.fillStyle = '#a5d8ff'
      for (const bullet of bullets) ctx.fillRect(bullet.x - 1, bullet.y - 4, 2, 5)
      ctx.fillStyle = '#ff8787'
      for (const bullet of alienBullets) ctx.fillRect(bullet.x - 1, bullet.y, 2, 5)

      if (!dead && (invulnerable <= 0 || Math.floor(invulnerable * 12) % 2 === 0)) {
        ctx.fillStyle = '#51cf66'
        ctx.fillRect(playerX - ALIEN_W / 2, playerY - 3, ALIEN_W, 7)
        ctx.fillRect(playerX - 2, playerY - 8, 4, 6)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`WAVE ${wave}`, 8, 15)
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), VW - 8, 15)
      ctx.restore()
    },
  }
}
