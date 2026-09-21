import type { GameHooks, GameInstance, PointerInput } from '../engine/types'

const COLS = 7
const ROWS = 6
const MAX_LIVES = 3

function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0))
}

function dropRow(board: number[][], col: number): number {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row]![col] === 0) return row
  }
  return -1
}

function wins(board: number[][], player: number): boolean {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (board[row]![col] !== player) continue
      const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]
      for (const [dr, dc] of directions) {
        let count = 1
        for (let step = 1; step < 4; step += 1) {
          const r = row + dr * step
          const c = col + dc * step
          if (r < 0 || c < 0 || r >= ROWS || c >= COLS || board[r]![c] !== player) break
          count += 1
        }
        if (count >= 4) return true
      }
    }
  }
  return false
}

export function create(hooks: GameHooks): GameInstance {
  const board = emptyBoard()
  let playerTurn = true
  let score = 0
  let lives = MAX_LIVES
  let dead = false
  let cpuDelay = 0
  let roundTimer = 0
  let last: { row: number; col: number } | null = null
  let cursor = 3

  function legalColumns(): number[] {
    const out: number[] = []
    for (let col = 0; col < COLS; col += 1) if (board[0]![col] === 0) out.push(col)
    return out
  }

  function clone(): number[][] {
    return board.map((row) => row.slice())
  }

  function cpuPick(): number {
    const options = legalColumns()
    const mistake = Math.max(0, 0.3 - score * 0.06)
    if (Math.random() < mistake) return options[Math.floor(Math.random() * options.length)] as number

    let bestScore = -Infinity
    let best = options[0] as number
    for (const col of options) {
      const row = dropRow(board, col)
      let value = 3 - Math.abs(col - 3)

      const copy = clone()
      copy[row]![col] = 2
      if (wins(copy, 2)) value += 1000

      const block = clone()
      const playerRow = dropRow(board, col)
      if (playerRow >= 0) {
        block[playerRow]![col] = 1
        if (wins(block, 1)) value += 800
      }

      const after = clone()
      after[row]![col] = 2
      let danger = 0
      for (const reply of legalColumns()) {
        if (after[0]![reply] !== 0) continue
        const r = dropRow(after, reply)
        const test = after.map((line) => line.slice())
        test[r]![reply] = 1
        if (wins(test, 1)) danger += 1
      }
      value -= danger * 200
      value += Math.random() * 4

      if (value > bestScore) {
        bestScore = value
        best = col
      }
    }
    return best
  }

  function place(col: number, player: number): void {
    const row = dropRow(board, col)
    if (row < 0) return
    board[row]![col] = player
    last = { row, col }
  }

  function resolve(): void {
    if (wins(board, 1)) {
      score += 1
      hooks.setScore(score)
      hooks.audio.win()
      roundTimer = 1.1
    } else if (wins(board, 2)) {
      lives -= 1
      hooks.audio.hit()
      if (lives <= 0) {
        dead = true
        hooks.audio.gameOver()
        hooks.gameOver(score)
      } else {
        roundTimer = 1.1
      }
    } else if (legalColumns().length === 0) {
      hooks.audio.blip()
      roundTimer = 0.9
    } else {
      playerTurn = false
      cpuDelay = 0.5
    }
  }

  function reset(): void {
    for (const row of board) row.fill(0)
    last = null
    playerTurn = true
    cpuDelay = 0
    roundTimer = 0
  }

  function play(col: number): void {
    if (dead || !playerTurn || roundTimer > 0 || board[0]![col] !== 0) return
    place(col, 1)
    hooks.audio.step()
    resolve()
  }

  return {
    update(dt) {
      if (dead) return
      if (roundTimer > 0) {
        roundTimer -= dt
        if (roundTimer <= 0) reset()
        return
      }
      if (!playerTurn && cpuDelay > 0) {
        cpuDelay -= dt
        if (cpuDelay <= 0) {
          place(cpuPick(), 2)
          hooks.audio.step()
          resolve()
        }
      }
    },
    onKey(action, down) {
      if (!down || dead) return
      if (action === 'left') cursor = Math.max(0, cursor - 1)
      else if (action === 'right') cursor = Math.min(COLS - 1, cursor + 1)
      else if (action === 'a' || action === 'b' || action === 'down') play(cursor)
    },
    onPointer(input: PointerInput) {
      if (input.action !== 'down') return
      const col = Math.max(0, Math.min(COLS - 1, Math.floor((input.x / input.width) * COLS)))
      cursor = col
      play(col)
    },
    render(ctx, width, height) {
      const cell = Math.min(width / COLS, height / ROWS)
      const offsetX = (width - cell * COLS) / 2
      const offsetY = (height - cell * ROWS) / 2
      const radius = cell * 0.4

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#1d4ed8'
      ctx.fillRect(offsetX, offsetY, cell * COLS, cell * ROWS)

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const cx = offsetX + (col + 0.5) * cell
          const cy = offsetY + (row + 0.5) * cell
          const value = board[row]![col]
          ctx.fillStyle = '#0d1017'
          ctx.beginPath()
          ctx.arc(cx, cy, radius, 0, Math.PI * 2)
          ctx.fill()
          if (value !== 0) {
            ctx.fillStyle = value === 1 ? '#ff6b6b' : '#ffd43b'
            ctx.beginPath()
            ctx.arc(cx, cy, radius, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,0.25)'
            ctx.beginPath()
            ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.28, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      if (!dead && playerTurn && roundTimer <= 0) {
        const cx = offsetX + (cursor + 0.5) * cell
        ctx.fillStyle = 'rgba(255,255,255,0.22)'
        ctx.beginPath()
        ctx.arc(cx, offsetY + cell * 0.5, radius * 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      if (last) {
        ctx.strokeStyle = 'rgba(248,249,250,0.85)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(offsetX + (last.col + 0.5) * cell, offsetY + (last.row + 0.5) * cell, radius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 1
      }

      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = `${Math.max(10, cell * 0.34)}px monospace`
      ctx.textAlign = 'right'
      ctx.fillText('❤'.repeat(Math.max(0, lives)), offsetX + cell * COLS - 6, offsetY + cell * 0.4)
    },
  }
}
