export const KEY_ACTIONS: Record<string, string> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'a',
  Enter: 'a',
  KeyZ: 'a',
  KeyJ: 'a',
  KeyX: 'b',
  KeyK: 'b',
  Backspace: 'b',
}

export const PAUSE_KEYS = new Set(['Escape', 'KeyP'])

export interface SwipeResult {
  action: 'up' | 'down' | 'left' | 'right'
}

export function detectSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  threshold = 24,
): SwipeResult | null {
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null
  if (Math.abs(dx) > Math.abs(dy)) {
    return { action: dx > 0 ? 'right' : 'left' }
  }
  return { action: dy > 0 ? 'down' : 'up' }
}

export function dpadActions(dpad: 'full' | 'lr' | 'ud' | false | undefined): string[] {
  switch (dpad) {
    case 'lr':
      return ['left', 'right']
    case 'ud':
      return ['up', 'down']
    case false:
      return []
    default:
      return ['up', 'down', 'left', 'right']
  }
}
