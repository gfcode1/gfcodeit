import type { GameHooks, GameInstance, PointerInput } from '../engine/types'

const SIZE = 9
const MINES = 10
const NUMBER_COLORS = ['', '#4dabf7', '#51cf66', '#ffd43b', '#ff922b', '#ff6b6b', '#cc5de8', '#f783ac', '#ced4da']
const LONG_PRESS = 0.35

export function create(hooks: GameHooks): GameInstance {
  const mine: boolean[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false))
  const revealed: boolean[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false))
  const flagged: boolean[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false))
  const counts: number[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0))

  let firstClick = true
  let dead = false
  let won = false
  let flagMode = false
  let revealedSafe = 0
  let cursor = { x: 0, y: 0 }
  let press: { x: number; y: number; time: number; acted: boolean } | null = null

  function forEachCell(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) fn(x, y)
  }

  function neighbors(x: number, y: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = []
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.push({ x: nx, y: ny })
      }
    }
    return out
  }

  function plantMines(safeX: number, safeY: number): void {
    const safe = new Set<string>([`${safeX},${safeY}`])
    for (const { x, y } of neighbors(safeX, safeY)) safe.add(`${x},${y}`)
    const spots: { x: number; y: number }[] = []
    forEachCell((x, y) => {
      if (!safe.has(`${x},${y}`)) spots.push({ x, y })
    })
    for (let i = spots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[spots[i], spots[j]] = [spots[j] as { x: number; y: number }, spots[i] as { x: number; y: number }]
    }
    for (let i = 0; i < MINES && i < spots.length; i += 1) {
      mine[spots[i]!.y]![spots[i]!.x] = true
    }
    forEachCell((x, y) => {
      counts[y]![x] = neighbors(x, y).filter((n) => mine[n.y]![n.x]).length
    })
  }

  function finish(win: boolean): void {
    dead = true
    won = win
    if (win) hooks.audio.win()
    else hooks.audio.hit()
    hooks.gameOver(score())
  }

  function score(): number {
    return won ? SIZE * SIZE : revealedSafe
  }

  function reveal(x: number, y: number): void {
    if (dead || revealed[y]![x] || flagged[y]![x]) return
    revealed[y]![x] = true
    if (mine[y]![x]) {
      finish(false)
      return
    }
    revealedSafe += 1
    hooks.setScore(score())
    if (counts[y]![x] === 0) {
      for (const n of neighbors(x, y)) {
        if (!revealed[n.y]![n.x] && !flagged[n.y]![n.x]) reveal(n.x, n.y)
      }
    }
    if (revealedSafe === SIZE * SIZE - MINES) finish(true)
  }

  function toggleFlag(x: number, y: number): void {
    if (dead || revealed[y]![x]) return
    flagged[y]![x] = !flagged[y]![x]
    hooks.audio.flag()
  }

  function cellFromPointer(input: PointerInput): { x: number; y: number } {
    const size = Math.min(input.width, input.height)
    const offsetX = (input.width - size) / 2
    const offsetY = (input.height - size) / 2
    const cell = size / SIZE
    const x = Math.floor((input.x - offsetX) / cell)
    const y = Math.floor((input.y - offsetY) / cell)
    return { x: Math.max(0, Math.min(SIZE - 1, x)), y: Math.max(0, Math.min(SIZE - 1, y)) }
  }

  return {
    update(dt) {
      if (press && !press.acted) {
        press.time += dt
        if (press.time >= LONG_PRESS) {
          toggleFlag(press.x, press.y)
          press.acted = true
        }
      }
    },
    onKey(action, down) {
      if (!down) return
      if (action === 'up') cursor.y = Math.max(0, cursor.y - 1)
      else if (action === 'down') cursor.y = Math.min(SIZE - 1, cursor.y + 1)
      else if (action === 'left') cursor.x = Math.max(0, cursor.x - 1)
      else if (action === 'right') cursor.x = Math.min(SIZE - 1, cursor.x + 1)
      else if (action === 'flag') flagMode = !flagMode
      else if (action === 'a') {
        if (firstClick) {
          firstClick = false
          plantMines(cursor.x, cursor.y)
        }
        if (flagMode) toggleFlag(cursor.x, cursor.y)
        else reveal(cursor.x, cursor.y)
      } else if (action === 'b') toggleFlag(cursor.x, cursor.y)
    },
    onPointer(input) {
      const { x, y } = cellFromPointer(input)
      if (input.action === 'down') {
        cursor = { x, y }
        press = { x, y, time: 0, acted: false }
        return
      }
      if (input.action === 'up' && press) {
        const acted = press.acted
        press = null
        if (acted) return
        if (flagMode) {
          toggleFlag(x, y)
          return
        }
        if (firstClick) {
          firstClick = false
          plantMines(x, y)
        }
        reveal(x, y)
      }
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const cell = size / SIZE

      ctx.fillStyle = '#0f1117'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#1a1e28'
      ctx.fillRect(offsetX, offsetY, size, size)

      forEachCell((x, y) => {
        const px = offsetX + x * cell
        const py = offsetY + y * cell
        const isRevealed = revealed[y]![x]
        if (isRevealed) {
          ctx.fillStyle = '#232936'
          ctx.fillRect(px, py, cell, cell)
          ctx.strokeStyle = 'rgba(255,255,255,0.05)'
          ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1)
          if (mine[y]![x]) {
            ctx.fillStyle = '#ff6b6b'
            ctx.beginPath()
            ctx.arc(px + cell / 2, py + cell / 2, cell * 0.24, 0, Math.PI * 2)
            ctx.fill()
          } else if (counts[y]![x] > 0) {
            ctx.fillStyle = NUMBER_COLORS[counts[y]![x]] as string
            ctx.font = `bold ${cell * 0.6}px monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(counts[y]![x]), px + cell / 2, py + cell / 2 + 1)
            ctx.textBaseline = 'alphabetic'
          }
        } else {
          ctx.fillStyle = '#394152'
          ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2)
          ctx.fillStyle = 'rgba(255,255,255,0.06)'
          ctx.fillRect(px + 1, py + 1, cell - 2, 2)
          if (flagged[y]![x]) {
            ctx.fillStyle = '#ffd43b'
            ctx.beginPath()
            ctx.arc(px + cell / 2, py + cell / 2, cell * 0.18, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })

      ctx.strokeStyle = flagMode ? '#ffd43b' : '#4dabf7'
      ctx.lineWidth = 2
      ctx.strokeRect(offsetX + cursor.x * cell + 1, offsetY + cursor.y * cell + 1, cell - 2, cell - 2)
      ctx.lineWidth = 1
    },
  }
}
