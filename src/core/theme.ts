import type { ThemeMode } from './types'

export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

function readableInk(hex: string): string {
  const clean = hex.replace('#', '')
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.6 ? '#111111' : '#ffffff'
}

export function applyTheme(mode: ThemeMode, accent?: string): void {
  const root = document.documentElement
  root.dataset.theme = resolveTheme(mode)
  if (accent) {
    root.style.setProperty('--gf-accent', accent)
    root.style.setProperty('--gf-accent-ink', readableInk(accent))
  }
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => onChange(query.matches ? 'dark' : 'light')
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
