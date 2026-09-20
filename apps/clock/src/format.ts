export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Countdown display, rounded up so a running timer never shows 00:00 early. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const centis = Math.floor((total % 1000) / 10)
  return `${hours > 0 ? `${hours}:` : ''}${pad(minutes)}:${pad(seconds)}.${pad(centis)}`
}

export function formatClock(date: Date, hour12: boolean, showSeconds: boolean): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12,
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Normalize a time input to 'HH:MM' (24h); returns '' when empty/invalid. */
export function normalizeTimeOfDay(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''
  return `${pad(hours)}:${pad(minutes)}`
}

export function formatTimeOfDay(value: string, hour12: boolean): string {
  const normalized = normalizeTimeOfDay(value)
  if (!normalized) return ''
  const [hours, minutes] = normalized.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12 })
}

/** Next epoch at the given 'HH:MM', strictly after `from`. */
export function nextTimeOfDay(time: string, from = new Date()): number | null {
  const normalized = normalizeTimeOfDay(time)
  if (!normalized) return null
  const [hours, minutes] = normalized.split(':').map(Number)
  const target = new Date(from)
  target.setHours(hours, minutes, 0, 0)
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1)
  return target.getTime()
}
