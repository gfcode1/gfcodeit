import type { GameHooks, GameInstance } from '../engine/types'

const SIZE = 4

const COLORS: Record<number, string> = {
  2: '#eee4da',
  4: '#ede0c8',
  8: '#f2b179',
  16: '#f59563',
  32: '#f67c5f',
  64: '#f65e3b',
  128: '#edcf72',
  256: '#edcc61',
  512: '#edc850',
  1024: '#edc53f',
  2048: '#edc22e',
}

interface Tile {
  value: number
  age: number
}

type Grid = Tile[][]

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ value: 0, age: 1 })))
}

export function create(hooks: GameHooks): GameInstance {
  let grid: Grid = emptyGrid()
  let score = 0
  let dead = false
  let won = false
  let moved = false

  function addRandom(): void {
    const empties: { x: number; y: number }[] = []
    grid.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile.value === 0) empties.push({ x, y })
      }),
    )
    if (empties.length === 0) return
    const spot = empties[Math.floor(Math.random() * empties.length)]!
    const tile = grid[spot.y]![spot.x]!
    tile.value = Math.random() < 0.9 ? 2 : 4
    tile.age = 0
  }

  function hasMoves(): boolean {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const value = grid[y]![x]!.value
        if (value === 0) return true
        if (x + 1 < SIZE && grid[y]![x + 1]!.value === value) return true
        if (y + 1 < SIZE && grid[y + 1]![x]!.value === value) return true
      }
    }
    return false
  }

  function coords(direction: string): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = []
    for (let i = 0; i < SIZE; i += 1) {
      for (let j = 0; j < SIZE; j += 1) {
        if (direction === 'left') result.push({ x: j, y: i })
        else if (direction === 'right') result.push({ x: SIZE - 1 - j, y: i })
        else if (direction === 'up') result.push({ x: i, y: j })
        else result.push({ x: i, y: SIZE - 1 - j })
      }
    }
    return result
  }

  function move(direction: string): void {
    if (dead) return
    const before = grid.map((row) => row.map((tile) => tile.value))
    let gained = 0

    for (let line = 0; line < SIZE; line += 1) {
      const cells = coords(direction).slice(line * SIZE, line * SIZE + SIZE)
      const tiles = cells.map(({ x, y }) => grid[y]![x]!)
      const compact = tiles.filter((tile) => tile.value !== 0)
      for (let i = 0; i < compact.length - 1; i += 1) {
        if (compact[i]!.value === compact[i + 1]!.value) {
          compact[i]!.value *= 2
          compact[i]!.age = 0
          gained += compact[i]!.value
          if (compact[i]!.value >= 2048) won = true
          compact[i + 1]!.value = 0
          compact.splice(i + 1, 1)
        }
      }
      const values = compact.concat(Array.from({ length: SIZE - compact.length }, () => ({ value: 0, age: 1 })))
      cells.forEach(({ x, y }, index) => {
        grid[y]![x] = values[index]!
      })
    }

    const after = grid.map((row) => row.map((tile) => tile.value))
    moved = JSON.stringify(before) !== JSON.stringify(after)

    if (moved) {
      score += gained
      if (gained > 0) hooks.audio.powerUp()
      else hooks.audio.step()
      hooks.setScore(score)
      addRandom()
      if (!hasMoves()) {
        dead = true
        hooks.audio.gameOver()
        hooks.gameOver(score)
      }
    }
  }

  function tileColor(value: number): string {
    return COLORS[value] ?? '#3c3a32'
  }

  addRandom()
  addRandom()

  return {
    update(dt) {
      for (const row of grid) {
        for (const tile of row) {
          if (tile.age < 1) tile.age = Math.min(1, tile.age + dt / 0.14)
        }
      }
    },
    onKey(action, down) {
      if (!down) return
      if (['left', 'right', 'up', 'down'].includes(action)) move(action)
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const gap = size * 0.025
      const cell = (size - gap * (SIZE + 1)) / SIZE

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#141821'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#1f2430'
      ctx.fillRect(offsetX, offsetY, size, size)

      grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          const px = offsetX + gap + x * (cell + gap)
          const py = offsetY + gap + y * (cell + gap)
          ctx.fillStyle = '#2b3140'
          ctx.fillRect(px, py, cell, cell)
          if (tile.value === 0) return
          const scale = 0.62 + 0.38 * tile.age
          const drawSize = cell * scale
          const inset = (cell - drawSize) / 2
          ctx.fillStyle = tileColor(tile.value)
          ctx.fillRect(px + inset, py + inset, drawSize, drawSize)
          const text = String(tile.value)
          const fontSize = cell * (text.length > 3 ? 0.28 : text.length > 2 ? 0.32 : 0.4)
          ctx.font = `bold ${fontSize}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = tile.value <= 4 ? '#3c3a32' : '#f9f6f2'
          ctx.fillText(text, px + cell / 2, py + cell / 2 + 1)
          ctx.textBaseline = 'alphabetic'
        })
      })

      if (won && !dead) {
        ctx.fillStyle = 'rgba(237,194,46,0.16)'
        ctx.fillRect(offsetX, offsetY, size, size)
      }
    },
  }
}
