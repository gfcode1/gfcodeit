import type { Sfx } from './audio'

export interface PointerInput {
  x: number
  y: number
  width: number
  height: number
  action: 'down' | 'move' | 'up'
}

export interface GameHooks {
  audio: Sfx
  best: number
  setScore(score: number): void
  gameOver(score: number): void
  requestPause(): void
}

export interface GameInstance {
  update(dt: number): void
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void
  onKey?(action: string, down: boolean): void
  onPointer?(input: PointerInput): void
  resize?(width: number, height: number): void
  destroy?(): void
}

export interface ControlButton {
  action: string
  label: string
}

export interface ControlSpec {
  dpad?: 'full' | 'lr' | 'ud' | false
  buttons?: ControlButton[]
  swipe?: boolean
}

export interface GameMeta {
  id: string
  name: string
  icon: string
  description: string
  help: string
  aspect: number
  controls: ControlSpec
}

export type GameFactory = (hooks: GameHooks) => GameInstance
