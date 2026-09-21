import type { GameHooks, GameInstance, PointerInput } from '../engine/types'

const SIZE = 3
const MAX_LIVES = 3

export function create(hooks: GameHooks): GameInstance {
  let lives = MAX_LIVES
  let score = 0
  let active = -1
  let upTimer = 0
  let spawnTimer = 0.8
  let cursor = { x: 1, y: 1 }
  let dead = false
  let hitFlash = 0

  function gap(): number {
    return Math.max(0.45, 1.1 - score * 0.03)
  }

  function spawn(): void {
    active = Math.floor(Math.random() * SIZE * SIZE)
    upTimer = Math.max(0.55, 1.35 - score * 0.04)
  }

  function miss(): void {
    lives -= 1
    hooks.audio.hit()
    active = -1
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
      return
    }
    spawnTimer = 0.4
  }

  function whack(index: number): void {
    if (dead) return
    if (index !== active) return
    score += 1
    hooks.setScore(score)
    hooks.audio.eat()
    hitFlash = 0.12
    active = -1
    spawnTimer = gap()
  }

  function indexAt(input: PointerInput): number {
    const size = Math.min(input.width, input.height)
    const offsetX = (input.width - size) / 2
    const offsetY = (input.height - size) / 2
    const cell = size / SIZE
    const x = Math.max(0, Math.min(SIZE - 1, Math.floor((input.x - offsetX) / cell)))
    const y = Math.max(0, Math.min(SIZE - 1, Math.floor((input.y - offsetY) / cell)))
    return y * SIZE + x
  }

  return {
    update(dt) {
      if (dead) return
      if (hitFlash > 0) hitFlash -= dt
      if (active === -1) {
        spawnTimer -= dt
        if (spawnTimer <= 0) spawn()
        return
      }
      upTimer -= dt
      if (upTimer <= 0) miss()
    },
    onKey(action, down) {
      if (!down || dead) return
      if (action === 'up') cursor.y = Math.max(0, cursor.y - 1)
      else if (action === 'down') cursor.y = Math.min(SIZE - 1, cursor.y + 1)
      else if (action === 'left') cursor.x = Math.max(0, cursor.x - 1)
      else if (action === 'right') cursor.x = Math.min(SIZE - 1, cursor.x + 1)
      else if (action === 'a' || action === 'b') whack(cursor.y * SIZE + cursor.x)
    },
    onPointer(input) {
      if (input.action !== 'down') return
      const index = indexAt(input)
      cursor = { x: index % SIZE, y: Math.floor(index / SIZE) }
      whack(index)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const cell = size / SIZE

      ctx.fillStyle = '#12351f'
      ctx.fillRect(0, 0, width, height)

      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const index = y * SIZE + x
          const cx = offsetX + (x + 0.5) * cell
          const cy = offsetY + (y + 0.55) * cell
          ctx.fillStyle = '#1b4a2b'
          ctx.beginPath()
          ctx.ellipse(cx, cy + cell * 0.12, cell * 0.34, cell * 0.2, 0, 0, Math.PI * 2)
          ctx.fill()

          if (index === active) {
            ctx.fillStyle = '#a06a3a'
            ctx.beginPath()
            ctx.arc(cx, cy - cell * 0.04, cell * 0.26, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#2b2b2b'
            ctx.beginPath()
            ctx.arc(cx - cell * 0.09, cy - cell * 0.1, cell * 0.035, 0, Math.PI * 2)
            ctx.arc(cx + cell * 0.09, cy - cell * 0.1, cell * 0.035, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.35)'
            ctx.beginPath()
            ctx.ellipse(cx, cy + cell * 0.04, cell * 0.24, cell * 0.12, 0, 0, Math.PI * 2)
            ctx.fill()
          }

          if (index === cursor.y * SIZE + cursor.x) {
            ctx.strokeStyle = '#f8f9fa'
            ctx.lineWidth = 2
            ctx.strokeRect(offsetX + x * cell + 2, offsetY + y * cell + 2, cell - 4, cell - 4)
            ctx.lineWidth = 1
          }
        }
      }

      if (hitFlash > 0) {
        ctx.fillStyle = 'rgba(248,249,250,0.12)'
        ctx.fillRect(0, 0, width, height)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = `${Math.max(11, size * 0.05)}px monospace`
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), offsetX + size - size * 0.02, offsetY + size * 0.07)
    },
  }
}
