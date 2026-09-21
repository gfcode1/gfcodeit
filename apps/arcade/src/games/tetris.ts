import type { GameHooks, GameInstance } from '../engine/types'

const COLS = 10
const ROWS = 20
const PANEL = 4
const TOTAL = COLS + PANEL

const COLORS = ['#000000', '#22b8cf', '#fcc419', '#cc5de8', '#51cf66', '#ff6b6b', '#4c6ef5', '#ff922b']

const SHAPES: number[][][] = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [2, 2],
    [2, 2],
  ],
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ],
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ],
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ],
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ],
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ],
]

interface Piece {
  cells: number[][]
  x: number
  y: number
}

function rotate(matrix: number[][]): number[][] {
  const n = matrix.length
  const out: number[][] = []
  for (let i = 0; i < n; i += 1) {
    out.push([])
    for (let j = 0; j < n; j += 1) {
      out[i]!.push(matrix[n - 1 - j]![i]!)
    }
  }
  return out
}

export function create(hooks: GameHooks): GameInstance {
  const board: number[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0))
  let current: Piece = spawn()
  let next: Piece = spawn()
  let score = 0
  let lines = 0
  let dropAcc = 0
  let softDrop = false
  let dead = false

  function spawn(): Piece {
    const index = Math.floor(Math.random() * SHAPES.length)
    const cells = SHAPES[index]!.map((row) => row.slice())
    return { cells, x: Math.floor((COLS - cells.length) / 2), y: -1 }
  }

  function collides(piece: Piece, offsetX = 0, offsetY = 0, cells = piece.cells): boolean {
    for (let y = 0; y < cells.length; y += 1) {
      for (let x = 0; x < cells[y]!.length; x += 1) {
        if (!cells[y]![x]) continue
        const bx = piece.x + x + offsetX
        const by = piece.y + y + offsetY
        if (bx < 0 || bx >= COLS || by >= ROWS) return true
        if (by >= 0 && board[by]![bx]) return true
      }
    }
    return false
  }

  function lock(): void {
    current.cells.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return
        const by = current.y + y
        const bx = current.x + x
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) board[by]![bx] = value
      })
    })

    let cleared = 0
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (board[y]!.every((value) => value !== 0)) {
        board.splice(y, 1)
        board.unshift(Array.from({ length: COLS }, () => 0))
        cleared += 1
        y += 1
      }
    }

    if (cleared > 0) {
      const table = [0, 100, 300, 500, 800]
      const level = 1 + Math.floor(lines / 10)
      score += (table[cleared] ?? 800) * level
      lines += cleared
      hooks.setScore(score)
      hooks.audio.powerUp()
    }

    current = next
    next = spawn()
    current.y = 0
    dropAcc = 0
    if (collides(current)) {
      dead = true
      hooks.audio.gameOver()
      hooks.gameOver(score)
    }
  }

  function step(): void {
    if (!collides(current, 0, 1)) {
      current.y += 1
      if (softDrop) score += 1
    } else {
      lock()
    }
  }

  function move(dx: number): void {
    if (!collides(current, dx, 0)) current.x += dx
  }

  function rotateCurrent(): void {
    const rotated = rotate(current.cells)
    if (!collides(current, 0, 0, rotated)) {
      current.cells = rotated
      hooks.audio.blip()
      return
    }
    if (!collides(current, 1, 0, rotated)) {
      current.cells = rotated
      current.x += 1
      hooks.audio.blip()
      return
    }
    if (!collides(current, -1, 0, rotated)) {
      current.cells = rotated
      current.x -= 1
      hooks.audio.blip()
    }
  }

  function hardDrop(): void {
    let dropped = 0
    while (!collides(current, 0, 1)) {
      current.y += 1
      dropped += 1
    }
    score += dropped * 2
    hooks.setScore(score)
    hooks.audio.hit()
    lock()
  }

  function interval(): number {
    const level = 1 + Math.floor(lines / 10)
    const base = Math.max(0.08, 0.8 - (level - 1) * 0.07)
    return softDrop ? base * 0.12 : base
  }

  return {
    update(dt) {
      if (dead) return
      dropAcc += dt
      let guard = 0
      while (dropAcc >= interval() && !dead && guard < 4) {
        dropAcc -= interval()
        step()
        guard += 1
      }
    },
    onKey(action, down) {
      if (dead) return
      if (action === 'down') {
        softDrop = down
        return
      }
      if (!down) return
      if (action === 'left') move(-1)
      else if (action === 'right') move(1)
      else if (action === 'up' || action === 'a') rotateCurrent()
      else if (action === 'b') hardDrop()
    },
    render(ctx, width, height) {
      const cell = Math.min(width / TOTAL, height / ROWS)
      const offsetX = (width - cell * TOTAL) / 2
      const offsetY = (height - cell * ROWS) / 2

      ctx.fillStyle = '#0f1117'
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = '#161a24'
      ctx.fillRect(offsetX, offsetY, cell * COLS, cell * ROWS)

      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
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

      const drawCell = (cx: number, cy: number, color: string, alpha = 1): void => {
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.fillRect(offsetX + cx * cell + 1, offsetY + cy * cell + 1, cell - 2, cell - 2)
        ctx.globalAlpha = 1
      }

      board.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) drawCell(x, y, COLORS[value] as string)
        })
      })

      // Ghost projection of the current piece.
      if (!dead) {
        let ghostY = current.y
        while (!collides({ ...current, y: ghostY }, 0, 1)) ghostY += 1
        current.cells.forEach((row, y) => {
          row.forEach((value, x) => {
            if (!value || ghostY + y < 0) return
            drawCell(current.x + x, ghostY + y, COLORS[value] as string, 0.18)
          })
        })
        current.cells.forEach((row, y) => {
          row.forEach((value, x) => {
            if (!value || current.y + y < 0) return
            drawCell(current.x + x, current.y + y, COLORS[value] as string)
          })
        })
      }

      const panelX = offsetX + cell * COLS + cell * 0.6
      ctx.fillStyle = '#8b93a7'
      ctx.font = `${Math.max(9, cell * 0.5)}px monospace`
      ctx.textAlign = 'left'
      ctx.fillText('NEXT', panelX, offsetY + cell)
      next.cells.forEach((row, y) => {
        row.forEach((value, x) => {
          if (!value) return
          ctx.fillStyle = COLORS[value] as string
          ctx.fillRect(panelX + x * cell * 0.7, offsetY + cell * 1.6 + y * cell * 0.7, cell * 0.7 - 2, cell * 0.7 - 2)
        })
      })
      ctx.fillStyle = '#8b93a7'
      ctx.fillText('LINES', panelX, offsetY + cell * 6.2)
      ctx.fillStyle = '#e9ecef'
      ctx.font = `bold ${Math.max(12, cell * 0.8)}px monospace`
      ctx.fillText(String(lines), panelX, offsetY + cell * 7.1)
    },
  }
}
