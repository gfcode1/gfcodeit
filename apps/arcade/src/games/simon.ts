import type { GameHooks, GameInstance } from '../engine/types'

const PAD_FREQ = [392, 523, 659, 784]
const PAD_COLOR = ['#51cf66', '#ff6b6b', '#ffd43b', '#4dabf7']
const PAD_LIGHT = ['#8ce99a', '#ff8787', '#ffe066', '#a5d8ff']
const SHOW_ON = 0.42
const SHOW_GAP = 0.16

type Phase = 'showing' | 'input' | 'dead'

export function create(hooks: GameHooks): GameInstance {
  let sequence: number[] = []
  let phase: Phase = 'showing'
  let showStep = 0
  let showTimer = 0
  let activePad: number | null = null
  let inputIndex = 0
  let score = 0
  let flash = -1
  let flashTimer = 0

  function nextRound(): void {
    sequence.push(Math.floor(Math.random() * 4))
    showStep = 0
    activePad = null
    showTimer = 0.3
    phase = 'showing'
  }

  function tapPad(pad: number): void {
    if (phase !== 'input') return
    flash = pad
    flashTimer = 0.14
    hooks.audio.tone(PAD_FREQ[pad] as number, 180, 'sine', 0.3)
    if (sequence[inputIndex] === pad) {
      inputIndex += 1
      if (inputIndex >= sequence.length) {
        score += 1
        hooks.setScore(score)
        hooks.audio.blip()
        nextRound()
      }
    } else {
      phase = 'dead'
      hooks.audio.gameOver()
      hooks.gameOver(score)
    }
  }

  function padAt(x: number, y: number): number {
    return (y >= 0.5 ? 2 : 0) + (x >= 0.5 ? 1 : 0)
  }

  nextRound()

  return {
    update(dt) {
      if (flashTimer > 0) {
        flashTimer -= dt
        if (flashTimer <= 0) flash = -1
      }
      if (phase !== 'showing') return
      showTimer -= dt
      if (showTimer > 0) return
      if (activePad !== null) {
        activePad = null
        showTimer = SHOW_GAP
        return
      }
      if (showStep >= sequence.length) {
        phase = 'input'
        inputIndex = 0
        return
      }
      activePad = sequence[showStep] as number
      hooks.audio.tone(PAD_FREQ[activePad] as number, 280, 'sine', 0.3)
      showStep += 1
      showTimer = SHOW_ON
    },
    onKey(action, down) {
      if (!down) return
      const map: Record<string, number> = { left: 0, up: 1, down: 2, right: 3 }
      const pad = map[action]
      if (pad !== undefined) tapPad(pad)
    },
    onPointer(input) {
      if (input.action !== 'down') return
      const nx = input.x / input.width
      const ny = input.y / input.height
      tapPad(padAt(nx, ny))
    },
    render(ctx, width, height) {
      const size = Math.min(width, height)
      const offsetX = (width - size) / 2
      const offsetY = (height - size) / 2
      const gap = size * 0.04
      const pad = (size - gap * 3) / 2

      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#161a24'
      ctx.fillRect(offsetX, offsetY, size, size)

      for (let index = 0; index < 4; index += 1) {
        const col = index % 2
        const row = Math.floor(index / 2)
        const px = offsetX + gap + col * (pad + gap)
        const py = offsetY + gap + row * (pad + gap)
        const lit = activePad === index || flash === index
        ctx.fillStyle = lit ? (PAD_LIGHT[index] as string) : (PAD_COLOR[index] as string)
        ctx.globalAlpha = lit ? 1 : 0.55
        ctx.fillRect(px, py, pad, pad)
        ctx.globalAlpha = 1
      }

      if (phase === 'input') {
        ctx.fillStyle = 'rgba(248,249,250,0.5)'
        ctx.font = `${size * 0.05}px monospace`
        ctx.textAlign = 'center'
        ctx.fillText('YOUR TURN', offsetX + size / 2, offsetY + size / 2 + size * 0.02)
      }
    },
  }
}
