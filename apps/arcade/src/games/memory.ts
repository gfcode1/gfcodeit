import type { GameHooks, GameInstance, PointerInput } from '../engine/types'

const SIZE = 4
const PAIRS = (SIZE * SIZE) / 2
const COLORS = ['#4dabf7', '#51cf66', '#ffd43b', '#ff6b6b', '#cc5de8', '#ff922b', '#22b8cf', '#f783ac']
const FLIP_BACK = 0.7

interface Card {
  color: string
  revealed: boolean
  matched: boolean
}

export function create(hooks: GameHooks): GameInstance {
  const deck: Card[] = []
  for (let i = 0; i < PAIRS; i += 1) {
    const color = COLORS[i] as string
    deck.push({ color, revealed: false, matched: false })
    deck.push({ color, revealed: false, matched: false })
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card]
  }

  let first = -1
  let mismatch: { a: number; b: number; timer: number } | null = null
  let matches = 0
  let moves = 0
  let done = false
  let cursor = { x: 0, y: 0 }

  function score(): number {
    return Math.max(0, matches * 100 - moves * 5)
  }

  function select(index: number): void {
    if (done || mismatch) return
    const card = deck[index]
    if (!card || card.revealed || card.matched) return
    card.revealed = true
    if (first === -1) {
      first = index
      hooks.audio.blip()
      return
    }
    moves += 1
    const previous = deck[first]
    if (previous && previous.color === card.color) {
      previous.matched = true
      card.matched = true
      matches += 1
      first = -1
      hooks.audio.eat()
      hooks.setScore(score())
      if (matches === PAIRS) {
        done = true
        hooks.audio.win()
        hooks.gameOver(score())
      }
    } else {
      mismatch = { a: first, b: index, timer: FLIP_BACK }
      first = -1
      hooks.audio.hit()
      hooks.setScore(score())
    }
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
      if (!mismatch) return
      mismatch.timer -= dt
      if (mismatch.timer > 0) return
      const a = deck[mismatch.a]
      const b = deck[mismatch.b]
      if (a && !a.matched) a.revealed = false
      if (b && !b.matched) b.revealed = false
      mismatch = null
    },
    onKey(action, down) {
      if (!down) return
      if (action === 'up') cursor.y = Math.max(0, cursor.y - 1)
      else if (action === 'down') cursor.y = Math.min(SIZE - 1, cursor.y + 1)
      else if (action === 'left') cursor.x = Math.max(0, cursor.x - 1)
      else if (action === 'right') cursor.x = Math.min(SIZE - 1, cursor.x + 1)
      else if (action === 'a' || action === 'b') select(cursor.y * SIZE + cursor.x)
    },
    onPointer(input) {
      if (input.action !== 'down') return
      const index = indexAt(input)
      cursor = { x: index % SIZE, y: Math.floor(index / SIZE) }
      select(index)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const gap = size * 0.03
      const cell = (size - gap * (SIZE + 1)) / SIZE

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)

      deck.forEach((card, index) => {
        const x = index % SIZE
        const y = Math.floor(index / SIZE)
        const px = offsetX + gap + x * (cell + gap)
        const py = offsetY + gap + y * (cell + gap)
        const showFace = card.revealed || card.matched
        ctx.fillStyle = showFace ? card.color : '#2b3140'
        ctx.globalAlpha = card.matched ? 0.45 : 1
        ctx.fillRect(px, py, cell, cell)
        ctx.globalAlpha = 1
        if (!showFace) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6)
        }
        if (index === cursor.y * SIZE + cursor.x) {
          ctx.strokeStyle = '#f8f9fa'
          ctx.lineWidth = 2
          ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2)
          ctx.lineWidth = 1
        }
      })
    },
  }
}
