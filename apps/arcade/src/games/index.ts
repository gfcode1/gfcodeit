import type { GameFactory, GameMeta } from '../engine/types'

export interface CatalogEntry {
  meta: GameMeta
  load(): Promise<GameFactory>
}

export const CATALOG: CatalogEntry[] = [
  {
    meta: {
      id: 'snake',
      name: 'Snake',
      icon: '1F40D',
      description: 'Eat, grow, and never bite your own tail.',
      help: 'Arrows / WASD or swipe to steer.',
      aspect: 1,
      controls: { dpad: 'full', swipe: true },
    },
    load: () => import('./snake').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'tetris',
      name: 'Tetris',
      icon: '1F9F1',
      description: 'Stack falling blocks and clear full lines.',
      help: 'Arrows move, up rotates, X hard-drops.',
      aspect: 0.7,
      controls: { dpad: 'full', buttons: [{ action: 'a', label: 'Rotate' }, { action: 'b', label: 'Drop' }] },
    },
    load: () => import('./tetris').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'breakout',
      name: 'Breakout',
      icon: '1F3B1',
      description: 'Bounce the ball and smash every brick.',
      help: 'Drag or arrows to move · tap to launch.',
      aspect: 0.7,
      controls: { dpad: 'lr', buttons: [{ action: 'a', label: 'Launch' }] },
    },
    load: () => import('./breakout').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'pong',
      name: 'Pong',
      icon: '1F3D3',
      description: 'Outlast the CPU in the original duel.',
      help: 'Up / down or drag to move your paddle.',
      aspect: 1.4,
      controls: { dpad: 'ud' },
    },
    load: () => import('./pong').then((mod) => mod.create),
  },
  {
    meta: {
      id: '2048',
      name: '2048',
      icon: '1F522',
      description: 'Slide tiles and merge your way to 2048.',
      help: 'Arrows / WASD or swipe to slide.',
      aspect: 1,
      controls: { dpad: 'full', swipe: true },
    },
    load: () => import('./g2048').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'minesweeper',
      name: 'Minesweeper',
      icon: '1F4A3',
      description: 'Clear every safe tile without a boom.',
      help: 'Tap to reveal · long-press or X to flag.',
      aspect: 1,
      controls: { buttons: [{ action: 'flag', label: 'Flag' }] },
    },
    load: () => import('./minesweeper').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'simon',
      name: 'Simon',
      icon: '1F3B5',
      description: 'Repeat the ever-growing colour sequence.',
      help: 'Tap the pads in order (or arrow keys).',
      aspect: 1,
      controls: { dpad: 'full' },
    },
    load: () => import('./simon').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'flappy',
      name: 'Flappy',
      icon: '1F426',
      description: 'Flap through the pipes without crashing.',
      help: 'Tap or press space to flap.',
      aspect: 0.5625,
      controls: { buttons: [{ action: 'a', label: 'Flap' }] },
    },
    load: () => import('./flappy').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'asteroids',
      name: 'Asteroids',
      icon: '1F680',
      description: 'Drift, shoot and shatter the rocks before they hit you.',
      help: 'Left/right rotate · up thrusts · space fires.',
      aspect: 1,
      controls: { dpad: 'full', buttons: [{ action: 'a', label: 'Fire' }] },
    },
    load: () => import('./asteroids').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'invaders',
      name: 'Space Invaders',
      icon: '1F47E',
      description: 'Hold the line against descending waves of aliens.',
      help: 'Left/right move · space fires.',
      aspect: 0.75,
      controls: { dpad: 'lr', buttons: [{ action: 'a', label: 'Fire' }] },
    },
    load: () => import('./invaders').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'memory',
      name: 'Memory',
      icon: '1F0CF',
      description: 'Flip cards and pair every colour with as few moves as possible.',
      help: 'Tap two cards · arrows + space with a keyboard.',
      aspect: 1,
      controls: { dpad: 'full' },
    },
    load: () => import('./memory').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'whack',
      name: 'Whack-a-Mole',
      icon: '1F43F',
      description: 'Tap the moles before they duck back down.',
      help: 'Tap fast · arrows + space with a keyboard.',
      aspect: 1,
      controls: { dpad: 'full' },
    },
    load: () => import('./whack').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'lightsout',
      name: 'Lights Out',
      icon: '1F4A1',
      description: 'Turn every light off — fewest moves wins.',
      help: 'Tap a cell to toggle it and its neighbours.',
      aspect: 1,
      controls: { dpad: 'full' },
    },
    load: () => import('./lightsout').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'connect4',
      name: 'Connect Four',
      icon: '1F3AF',
      description: 'Line up four discs before the CPU does.',
      help: 'Left/right pick a column · tap or space drops.',
      aspect: 1.1667,
      controls: { dpad: 'full', buttons: [{ action: 'a', label: 'Drop' }] },
    },
    load: () => import('./connect4').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'tictactoe',
      name: 'Tic-Tac-Toe',
      icon: '1F9E9',
      description: 'Beat a growingly stubborn CPU to extend your streak.',
      help: 'Tap a square · arrows + space with a keyboard.',
      aspect: 1,
      controls: { dpad: 'full' },
    },
    load: () => import('./tictactoe').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'frogger',
      name: 'Frogger',
      icon: '1F438',
      description: 'Dodge the traffic and ride the logs safely home.',
      help: 'Arrows / swipe to hop one square at a time.',
      aspect: 0.9286,
      controls: { dpad: 'full', swipe: true },
    },
    load: () => import('./frogger').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'runner',
      name: 'Endless Runner',
      icon: '1F3C1',
      description: 'Sprint as far as you can, jumping and ducking hazards.',
      help: 'Up jumps, down ducks · tap the screen too.',
      aspect: 1.6,
      controls: { dpad: 'ud', buttons: [{ action: 'a', label: 'Jump' }] },
    },
    load: () => import('./runner').then((mod) => mod.create),
  },
  {
    meta: {
      id: 'lander',
      name: 'Lunar Lander',
      icon: '1F6F8',
      description: 'Touch down gently on the pad before the fuel runs out.',
      help: 'Left/right rotate · up thrusts · space thrusts.',
      aspect: 1.3333,
      controls: { dpad: 'full', buttons: [{ action: 'a', label: 'Thrust' }] },
    },
    load: () => import('./lander').then((mod) => mod.create),
  },
]

export function entryById(id: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.meta.id === id)
}
