import type { GameHooks, GameInstance, PointerInput } from '../engine/types'
import { randInt } from '../engine/format'

const SIZE = 5

export function create(hooks: GameHooks): GameInstance {
  const grid: boolean[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false))
  let moves = 0
  let done = false
  let cursor = { x: 2, y: 2 }

  function toggle(x: number, y: number): void {
    const offsets = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    for (const [dx, dy] of offsets) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) grid[ny]![nx] = !grid[ny]![nx]
    }
  }

  function isSolved(): boolean {
    return grid.every((row) => row.every((lit) => !lit))
  }

  function score(): number {
    return Math.max(50, 800 - moves * 10)
  }

  for (let i = 0; i < 7 + randInt(0, 4); i += 1) {
    toggle(randInt(0, SIZE - 1), randInt(0, SIZE - 1))
  }
  if (isSolved()) toggle(0, 0)

  function play(x: number, y: number): void {
    if (done) return
    toggle(x, y)
    moves += 1
    hooks.audio.step()
    if (isSolved()) {
      done = true
      hooks.audio.win()
      hooks.gameOver(score())
    } else {
      hooks.setScore(score())
    }
  }

  function cellAt(input: PointerInput): { x: number; y: number } {
    const size = Math.min(input.width, input.height)
    const offsetX = (input.width - size) / 2
    const offsetY = (input.height - size) / 2
    const cell = size / SIZE
    return {
      x: Math.max(0, Math.min(SIZE - 1, Math.floor((input.x - offsetX) / cell))),
      y: Math.max(0, Math.min(SIZE - 1, Math.floor((input.y - offsetY) / cell))),
    }
  }

  return {
    update() {
      // no time-based state
    },
    onKey(action, down) {
      if (!down || done) return
      if (action === 'up') cursor.y = Math.max(0, cursor.y - 1)
      else if (action === 'down') cursor.y = Math.min(SIZE - 1, cursor.y + 1)
      else if (action === 'left') cursor.x = Math.max(0, cursor.x - 1)
      else if (action === 'right') cursor.x = Math.min(SIZE - 1, cursor.x + 1)
      else if (action === 'a' || action === 'b') play(cursor.x, cursor.y)
    },
    onPointer(input) {
      if (input.action !== 'down' || done) return
      const cell = cellAt(input)
      cursor = cell
      play(cell.x, cell.y)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const gap = size * 0.03
      const cell = (size - gap * (SIZE + 1)) / SIZE

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)

      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const px = offsetX + gap + x * (cell + gap)
          const py = offsetY + gap + y * (cell + gap)
          ctx.fillStyle = grid[y]![x] ? '#ffd43b' : '#232936'
          ctx.fillRect(px, py, cell, cell)
          if (grid[y]![x]) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)'
            ctx.fillRect(px + cell * 0.16, py + cell * 0.16, cell * 0.32, cell * 0.32)
          }
        }
      }

      ctx.strokeStyle = '#4dabf7'
      ctx.lineWidth = 2
      ctx.strokeRect(offsetX + gap + cursor.x * (cell + gap) - 1, offsetY + gap + cursor.y * (cell + gap) - 1, cell + 2, cell + 2)
      ctx.lineWidth = 1
    },
  }
}
