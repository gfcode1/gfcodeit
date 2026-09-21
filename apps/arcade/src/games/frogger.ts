import type { GameHooks, GameInstance } from '../engine/types'

const COLS = 13
const ROWS = 14
const MAX_LIVES = 3

interface Entity {
  x: number
  len: number
}

interface Lane {
  row: number
  dir: number
  speed: number
  type: 'car' | 'log'
  color: string
  objects: Entity[]
}

function buildLanes(): Lane[] {
  const road: { row: number; dir: number; speed: number; len: number; gap: number; color: string }[] = [
    { row: 7, dir: 1, speed: 1.6, len: 2, gap: 5, color: '#ff6b6b' },
    { row: 8, dir: -1, speed: 2.4, len: 2, gap: 4, color: '#ffd43b' },
    { row: 9, dir: 1, speed: 1.9, len: 3, gap: 6, color: '#a5d8ff' },
    { row: 10, dir: -1, speed: 2.1, len: 2, gap: 5, color: '#ff922b' },
  ]
  const river: { row: number; dir: number; speed: number; len: number; gap: number }[] = [
    { row: 1, dir: 1, speed: 1.2, len: 4, gap: 5 },
    { row: 2, dir: -1, speed: 1.6, len: 3, gap: 4 },
    { row: 3, dir: 1, speed: 1.0, len: 4, gap: 6 },
    { row: 4, dir: -1, speed: 1.4, len: 3, gap: 5 },
    { row: 5, dir: 1, speed: 1.3, len: 4, gap: 5 },
  ]

  const lanes: Lane[] = []
  for (const spec of road) {
    const objects: Entity[] = []
    let x = Math.random() * 6
    while (x < COLS + spec.gap) {
      objects.push({ x, len: spec.len })
      x += spec.len + spec.gap
    }
    lanes.push({ row: spec.row, dir: spec.dir, speed: spec.speed, type: 'car', color: spec.color, objects })
  }
  for (const spec of river) {
    const objects: Entity[] = []
    let x = Math.random() * 5
    while (x < COLS + spec.gap) {
      objects.push({ x, len: spec.len })
      x += spec.len + spec.gap
    }
    lanes.push({ row: spec.row, dir: spec.dir, speed: spec.speed, type: 'log', color: '#b08968', objects })
  }
  return lanes
}

export function create(hooks: GameHooks): GameInstance {
  let lanes = buildLanes()
  let player = { x: 6, row: ROWS - 1 }
  let maxRow = ROWS - 1
  let lives = MAX_LIVES
  let score = 0
  let dead = false

  function laneAt(row: number): Lane | undefined {
    return lanes.find((lane) => lane.row === row)
  }

  function resetPlayer(): void {
    player = { x: 6, row: ROWS - 1 }
    maxRow = ROWS - 1
  }

  function die(): void {
    if (dead) return
    lives -= 1
    hooks.audio.hit()
    if (lives <= 0) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
      return
    }
    resetPlayer()
  }

  function reachHome(): void {
    score += 100
    hooks.setScore(score)
    hooks.audio.win()
    resetPlayer()
  }

  function hop(dx: number, dy: number): void {
    if (dead) return
    const nextRow = Math.max(0, Math.min(ROWS - 1, player.row + dy))
    const nextX = Math.max(0, Math.min(COLS - 1, player.x + dx))
    player.row = nextRow
    player.x = nextX
    hooks.audio.step()
    if (nextRow < maxRow) {
      maxRow = nextRow
      score += 10
      hooks.setScore(score)
    }
    if (player.row === 0) reachHome()
  }

  function overlaps(playerX: number, entity: Entity): boolean {
    return playerX < entity.x + entity.len && playerX + 1 > entity.x
  }

  return {
    update(dt) {
      if (dead) return

      for (const lane of lanes) {
        for (const object of lane.objects) {
          object.x += lane.dir * lane.speed * dt
        }
        if (lane.dir > 0) {
          for (const object of lane.objects) {
            if (object.x > COLS + 1) object.x = -object.len - Math.random() * 3
          }
        } else {
          for (const object of lane.objects) {
            if (object.x + object.len < -1) object.x = COLS + 1 + Math.random() * 3
          }
        }
      }

      const lane = laneAt(player.row)
      if (!lane) return

      if (lane.type === 'car') {
        for (const car of lane.objects) {
          if (overlaps(player.x, car)) {
            die()
            return
          }
        }
        return
      }

      // River: the player must be riding a log or they drown.
      const center = player.x + 0.5
      const log = lane.objects.find((object) => center >= object.x && center <= object.x + object.len)
      if (!log) {
        die()
        return
      }
      player.x += lane.dir * lane.speed * dt
      if (player.x < -0.35 || player.x > COLS - 0.65) die()
    },
    onKey(action, down) {
      if (!down) return
      if (action === 'up') hop(0, -1)
      else if (action === 'down') hop(0, 1)
      else if (action === 'left') hop(-1, 0)
      else if (action === 'right') hop(1, 0)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const cell = size / COLS
      const boardW = cell * COLS
      const boardH = cell * ROWS
      const offsetX = (width - boardW) / 2
      const offsetY = (height - boardH) / 2

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)

      for (let row = 0; row < ROWS; row += 1) {
        const y = offsetY + row * cell
        let color = '#2b2d42'
        if (row === 0) color = '#1b4332'
        else if (row === 6) color = '#40916c'
        else if (row >= 11) color = '#2d6a4f'
        else if (row >= 1 && row <= 5) color = '#1d3557'
        else color = '#343a40'
        ctx.fillStyle = color
        ctx.fillRect(offsetX, y, boardW, cell)
      }

      // Home slots
      for (let i = 0; i < 5; i += 1) {
        const slotX = offsetX + (1 + i * 2.4) * cell * 0.5
        ctx.fillStyle = '#081c15'
        ctx.fillRect(slotX, offsetY + cell * 0.2, cell * 1.6, cell * 0.6)
      }

      // Road dashes
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      for (let row = 7; row <= 10; row += 1) {
        const y = offsetY + (row + 0.5) * cell
        ctx.beginPath()
        ctx.setLineDash([4, 6])
        ctx.moveTo(offsetX, y)
        ctx.lineTo(offsetX + boardW, y)
        ctx.stroke()
      }
      ctx.setLineDash([])

      for (const lane of lanes) {
        const y = offsetY + lane.row * cell
        for (const object of lane.objects) {
          const x = offsetX + object.x * cell
          if (lane.type === 'car') {
            ctx.fillStyle = lane.color
            ctx.fillRect(x, y + cell * 0.2, object.len * cell, cell * 0.6)
            ctx.fillStyle = 'rgba(0,0,0,0.25)'
            ctx.fillRect(x + object.len * cell - cell * 0.25, y + cell * 0.25, cell * 0.2, cell * 0.5)
          } else {
            ctx.fillStyle = lane.color
            ctx.fillRect(x, y + cell * 0.25, object.len * cell, cell * 0.5)
          }
        }
      }

      // Player
      const px = offsetX + player.x * cell
      const py = offsetY + player.row * cell
      ctx.fillStyle = dead ? '#868e96' : '#95d5b2'
      ctx.fillRect(px + cell * 0.12, py + cell * 0.12, cell * 0.76, cell * 0.76)
      ctx.fillStyle = '#081c15'
      ctx.fillRect(px + cell * 0.6, py + cell * 0.28, cell * 0.14, cell * 0.14)

      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = `${Math.max(9, cell * 0.8)}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText(`HOME`, offsetX, offsetY - 4)
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), offsetX + boardW, offsetY - 4)
    },
  }
}
