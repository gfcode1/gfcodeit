export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1)
}

/** 42 consecutive days (6 weeks, Monday-first) covering the given month. */
export function monthMatrix(year: number, month: number): Date[] {
  const first = startOfMonth(year, month)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from(
    { length: 42 },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  )
}

export function isSameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatDayLabel(iso: string): string {
  const date = parseISODate(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatShortDate(iso: string): string {
  const date = parseISODate(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Normalize a time input to 'HH:MM' (24h); returns '' when empty/invalid. */
export function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''
  return `${pad(hours)}:${pad(minutes)}`
}

export function formatTime(value: string): string {
  const normalized = normalizeTime(value)
  if (!normalized) return ''
  const [hours, minutes] = normalized.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
