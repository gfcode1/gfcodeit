import { formatTime, normalizeTime } from './dates'

export interface CalendarEvent {
  id: string
  title: string
  date: string
  allDay: boolean
  startTime: string
  endTime: string
  notes: string
  color: string
  /** Id of the scheduled reminder in the shell scheduler, when armed. */
  reminderId?: string
  createdAt: number
  updatedAt: number
}

export const EVENT_COLORS = ['#8b5cf6', '#ff4d00', '#0057ff', '#0a7d32', '#d40000', '#6b6b63']

export function createEvent(date: string, color = EVENT_COLORS[0]): CalendarEvent {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: '',
    date,
    allDay: false,
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
    color,
    createdAt: now,
    updatedAt: now,
  }
}

/** All-day events first, then by start time, then by creation order. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  const startA = normalizeTime(a.startTime) || '00:00'
  const startB = normalizeTime(b.startTime) || '00:00'
  if (startA !== startB) return startA < startB ? -1 : 1
  return a.createdAt - b.createdAt
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(compareEvents)
}

export function eventsForDate(events: CalendarEvent[], date: string): CalendarEvent[] {
  return sortEvents(events.filter((event) => event.date === date))
}

export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const bucket = map.get(event.date)
    if (bucket) bucket.push(event)
    else map.set(event.date, [event])
  }
  for (const [date, bucket] of map) map.set(date, sortEvents(bucket))
  return map
}

export function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  const start = formatTime(event.startTime)
  const end = formatTime(event.endTime)
  if (start && end) return `${start} – ${end}`
  return start || end || 'No time'
}
