import type { GameHooks, GameInstance, PointerInput } from '../engine/types'

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function create(hooks: GameHooks): GameInstance {
  const board: number[] = Array.from({ length: 9 }, () => 0)
  let playerTurn = true
  let streak = 0
  let dead = false
  let cpuDelay = 0
  let roundTimer = 0
  let winLine: number[] | null = null
  let cursor = { x: 1, y: 1 }

  function winner(b: number[]): 1 | 2 | 0 | null {
    for (const line of LINES) {
      const [a, c, d] = line as [number, number, number]
      if (b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) return b[a] as 1 | 2
    }
    return b.every((cell) => cell !== 0) ? 0 : null
  }

  function winningLine(b: number[]): number[] | null {
    for (const line of LINES) {
      const [a, c, d] = line as [number, number, number]
      if (b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) return line
    }
    return null
  }

  function minimax(b: number[], turn: 2 | 1): number {
    const state = winner(b)
    if (state === 2) return 10
    if (state === 1) return -10
    if (state === 0) return 0
    const scores: number[] = []
    for (let i = 0; i < 9; i += 1) {
      if (b[i] !== 0) continue
      b[i] = turn
      scores.push(minimax(b, turn === 2 ? 1 : 2))
      b[i] = 0
    }
    return turn === 2 ? Math.max(...scores) : Math.min(...scores)
  }

  function cpuMove(): void {
    const empties = board.map((cell, index) => (cell === 0 ? index : -1)).filter((index) => index >= 0)
    if (empties.length === 0) return
    const mistake = Math.max(0, 0.55 - streak * 0.07)
    let choice: number
    if (Math.random() < mistake) {
      choice = empties[Math.floor(Math.random() * empties.length)] as number
    } else {
      let best = -Infinity
      choice = empties[0] as number
      for (const index of empties) {
        board[index] = 2
        const value = minimax(board, 1)
        board[index] = 0
        if (value > best) {
          best = value
          choice = index
        }
      }
    }
    board[choice] = 2
    hooks.audio.step()
    resolve()
  }

  function resolve(): void {
    const state = winner(board)
    if (state === 1) {
      streak += 1
      hooks.setScore(streak)
      hooks.audio.win()
      winLine = winningLine(board)
      roundTimer = 1
    } else if (state === 2) {
      dead = true
      winLine = winningLine(board)
      hooks.audio.gameOver()
      hooks.gameOver(streak)
    } else if (state === 0) {
      hooks.audio.blip()
      roundTimer = 0.8
    } else {
      playerTurn = false
      cpuDelay = 0.4
    }
  }

  function reset(): void {
    board.fill(0)
    winLine = null
    playerTurn = true
    cpuDelay = 0
    roundTimer = 0
  }

  function play(index: number): void {
    if (dead || !playerTurn || roundTimer > 0 || board[index] !== 0) return
    board[index] = 1
    hooks.audio.blip()
    resolve()
  }

  function cellAt(input: PointerInput): number {
    const size = Math.min(input.width, input.height)
    const offsetX = (input.width - size) / 2
    const offsetY = (input.height - size) / 2
    const cell = size / 3
    const x = Math.max(0, Math.min(2, Math.floor((input.x - offsetX) / cell)))
    const y = Math.max(0, Math.min(2, Math.floor((input.y - offsetY) / cell)))
    return y * 3 + x
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
        if (cpuDelay <= 0) cpuMove()
      }
    },
    onKey(action, down) {
      if (!down || dead) return
      if (action === 'up') cursor.y = Math.max(0, cursor.y - 1)
      else if (action === 'down') cursor.y = Math.min(2, cursor.y + 1)
      else if (action === 'left') cursor.x = Math.max(0, cursor.x - 1)
      else if (action === 'right') cursor.x = Math.min(2, cursor.x + 1)
      else if (action === 'a' || action === 'b') play(cursor.y * 3 + cursor.x)
    },
    onPointer(input) {
      if (input.action !== 'down') return
      const index = cellAt(input)
      cursor = { x: index % 3, y: Math.floor(index / 3) }
      play(index)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const cell = size / 3

      ctx.fillStyle = '#151a22'
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = Math.max(2, size * 0.008)
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath()
        ctx.moveTo(offsetX + i * cell, offsetY + size * 0.04)
        ctx.lineTo(offsetX + i * cell, offsetY + size * 0.96)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(offsetX + size * 0.04, offsetY + i * cell)
        ctx.lineTo(offsetX + size * 0.96, offsetY + i * cell)
        ctx.stroke()
      }

      board.forEach((value, index) => {
        if (value === 0) return
        const x = index % 3
        const y = Math.floor(index / 3)
        const cx = offsetX + (x + 0.5) * cell
        const cy = offsetY + (y + 0.5) * cell
        const r = cell * 0.24
        ctx.strokeStyle = value === 1 ? '#4dabf7' : '#ff6b6b'
        ctx.lineWidth = Math.max(3, size * 0.012)
        if (value === 1) {
          ctx.beginPath()
          ctx.moveTo(cx - r, cy - r)
          ctx.lineTo(cx + r, cy + r)
          ctx.moveTo(cx + r, cy - r)
          ctx.lineTo(cx - r, cy + r)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      if (winLine) {
        const first = winLine[0] as number
        const last = winLine[2] as number
        ctx.strokeStyle = 'rgba(255,212,59,0.9)'
        ctx.lineWidth = Math.max(2, size * 0.01)
        ctx.beginPath()
        ctx.moveTo(offsetX + ((first % 3) + 0.5) * cell, offsetY + (Math.floor(first / 3) + 0.5) * cell)
        ctx.lineTo(offsetX + ((last % 3) + 0.5) * cell, offsetY + (Math.floor(last / 3) + 0.5) * cell)
        ctx.stroke()
      }

      if (playerTurn && !dead && roundTimer <= 0) {
        ctx.strokeStyle = 'rgba(248,249,250,0.7)'
        ctx.lineWidth = 2
        ctx.strokeRect(offsetX + cursor.x * cell + 3, offsetY + cursor.y * cell + 3, cell - 6, cell - 6)
      }
      ctx.lineWidth = 1
    },
  }
}
