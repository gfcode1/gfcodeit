export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function pad(n: number, width: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, '0')
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function choice<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j] as T, items[i] as T]
  }
  return items
}
