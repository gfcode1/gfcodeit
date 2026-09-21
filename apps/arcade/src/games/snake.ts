import type { GameHooks, GameInstance } from '../engine/types'
import { randInt } from '../engine/format'

const COLS = 20
const ROWS = 20
const START_STEP = 0.16
const MIN_STEP = 0.07
const START_DELAY = 0.7

interface Cell {
  x: number
  y: number
}

export function create(hooks: GameHooks): GameInstance {
  let snake: Cell[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ]
  let dir: Cell = { x: 1, y: 0 }
  let queued: Cell | null = null
  let food: Cell = { x: 14, y: 10 }
  let score = 0
  let step = START_STEP
  let acc = 0
  let delay = START_DELAY
  let dead = false
  let growth = 0
  let flashFood = 0

  function spawnFood(): Cell {
    const taken = new Set(snake.map((cell) => `${cell.x},${cell.y}`))
    let candidate: Cell
    let guard = 0
    do {
      candidate = { x: randInt(0, COLS - 1), y: randInt(0, ROWS - 1) }
      guard += 1
    } while (taken.has(`${candidate.x},${candidate.y}`) && guard < 500)
    return candidate
  }

  food = spawnFood()

  function turn(x: number, y: number): void {
    if (dead) return
    const base = queued ?? dir
    if (base.x === -x && base.y === -y) return
    if (base.x === x && base.y === y) return
    queued = { x, y }
  }

  function advance(): void {
    if (queued) {
      dir = queued
      queued = null
    }
    const head = snake[0] as Cell
    const next = { x: head.x + dir.x, y: head.y + dir.y }

    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      dead = true
      hooks.audio.hit()
      hooks.gameOver(score)
      return
    }

    const willEat = next.x === food.x && next.y === food.y
    const body = willEat ? snake : snake.slice(0, -1)
    if (body.some((cell) => cell.x === next.x && cell.y === next.y)) {
      dead = true
      hooks.audio.hit()
      hooks.gameOver(score)
      return
    }

    snake.unshift(next)
    if (willEat) {
      score += 10
      growth += 1
      step = Math.max(MIN_STEP, step - 0.004)
      hooks.setScore(score)
      hooks.audio.eat()
      food = spawnFood()
      flashFood = 0.18
    }
    if (growth > 0) {
      growth -= 1
    } else {
      snake.pop()
    }
  }

  return {
    update(dt) {
      if (dead) return
      if (flashFood > 0) flashFood -= dt
      if (delay > 0) {
        delay -= dt
        return
      }
      acc += dt
      while (acc >= step && !dead) {
        acc -= step
        advance()
      }
    },
    onKey(action, down) {
      if (!down) return
      if (action === 'up') turn(0, -1)
      else if (action === 'down') turn(0, 1)
      else if (action === 'left') turn(-1, 0)
      else if (action === 'right') turn(1, 0)
    },
    render(ctx, width, height) {
      const cell = Math.min(width / COLS, height / ROWS)
      const offsetX = (width - cell * COLS) / 2
      const offsetY = (height - cell * ROWS) / 2

      ctx.fillStyle = '#12161f'
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      for (let x = 1; x < COLS; x += 1) {
        ctx.beginPath()
        ctx.moveTo(offsetX + x * cell, offsetY)
        ctx.lineTo(offsetX + x * cell, offsetY + ROWS * cell)
        ctx.stroke()
      }
      for (let y = 1; y < ROWS; y += 1) {
        ctx.beginPath()
        ctx.moveTo(offsetX, offsetY + y * cell)
        ctx.lineTo(offsetX + COLS * cell, offsetY + y * cell)
        ctx.stroke()
      }

      const inset = cell * 0.12
      ctx.fillStyle = flashFood > 0 ? '#ffe066' : '#ff4d4d'
      ctx.beginPath()
      ctx.arc(offsetX + (food.x + 0.5) * cell, offsetY + (food.y + 0.5) * cell, cell * 0.34, 0, Math.PI * 2)
      ctx.fill()

      snake.forEach((segment, index) => {
        const t = index / Math.max(1, snake.length - 1)
        const shade = 150 - Math.floor(t * 80)
        ctx.fillStyle = index === 0 ? '#8ce99a' : `rgb(60, ${shade}, 110)`
        ctx.fillRect(
          offsetX + segment.x * cell + inset,
          offsetY + segment.y * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
        )
      })
    },
  }
}
