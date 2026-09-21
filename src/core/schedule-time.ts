import type { ScheduleDraft, ScheduleItem, ScheduleKind, ScheduleRepeat } from './types'

export const MIN_INTERVAL_MS = 1_000
export const DEFAULT_SNOOZE_MS = 5 * 60_000
export const MAX_TITLE = 200
export const MAX_BODY = 1_000
export const MAX_DEEPLINK = 512

const KINDS = new Set<ScheduleKind>(['timer', 'alarm', 'reminder', 'notification'])
const REPEAT_MODES = new Set<ScheduleRepeat['mode']>(['daily', 'weekly', 'weekdays', 'interval'])

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'E_SCHEDULE' })
}

function boundedString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') fail(`${field} must be a string`)
  if ((value as string).length > max) fail(`${field} exceeds ${max} characters`)
  return value as string
}

function normalizeRepeat(value: unknown): ScheduleRepeat | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) fail('repeat must be an object')
  const raw = value as Record<string, unknown>
  const mode = raw.mode
  if (typeof mode !== 'string' || !REPEAT_MODES.has(mode as ScheduleRepeat['mode'])) fail('repeat.mode is invalid')
  const repeat: ScheduleRepeat = { mode: mode as ScheduleRepeat['mode'] }
  if (raw.days !== undefined) {
    if (
      !Array.isArray(raw.days) ||
      raw.days.length > 7 ||
      raw.days.some((day) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)
    ) {
      fail('repeat.days must be integers 0-6')
    }
    repeat.days = raw.days as number[]
  }
  if (raw.everyMs !== undefined) {
    if (typeof raw.everyMs !== 'number' || !Number.isFinite(raw.everyMs)) fail('repeat.everyMs must be a number')
    repeat.everyMs = raw.everyMs
  }
  return repeat
}

/** Next occurrence strictly after `now`, or null when the rule cannot advance. */
export function nextOccurrence(base: number, repeat: ScheduleRepeat, now: number): number | null {
  switch (repeat.mode) {
    case 'interval': {
      const every = repeat.everyMs ?? 0
      if (every < MIN_INTERVAL_MS) return null
      const steps = Math.max(1, Math.ceil((now - base) / every))
      return base + steps * every
    }
    case 'daily': {
      const date = new Date(base)
      do {
        date.setDate(date.getDate() + 1)
      } while (date.getTime() <= now)
      return date.getTime()
    }
    case 'weekly': {
      const days = new Set(repeat.days && repeat.days.length ? repeat.days : [new Date(base).getDay()])
      const date = new Date(base)
      for (let i = 0; i < 366; i += 1) {
        date.setDate(date.getDate() + 1)
        if (days.has(date.getDay()) && date.getTime() > now) return date.getTime()
      }
      return null
    }
    case 'weekdays': {
      const date = new Date(base)
      do {
        date.setDate(date.getDate() + 1)
      } while (date.getDay() === 0 || date.getDay() === 6 || date.getTime() <= now)
      return date.getTime()
    }
    default:
      return null
  }
}

export type NormalizedDraft = Omit<
  ScheduleItem,
  'id' | 'appId' | 'profileId' | 'createdAt' | 'updatedAt' | 'status'
>

/** Validates a draft and resolves it into a concrete entry (one-shot fireAt). */
export function normalizeDraft(draft: ScheduleDraft, now = Date.now()): NormalizedDraft {
  if (typeof draft !== 'object' || draft === null) fail('draft must be an object')
  const raw = draft as unknown as Record<string, unknown>

  const kind = raw.kind
  if (typeof kind !== 'string' || !KINDS.has(kind as ScheduleKind)) {
    fail('kind must be one of timer, alarm, reminder, notification')
  }

  const hasDelay = typeof raw.delayMs === 'number' && Number.isFinite(raw.delayMs)
  const hasAt = typeof raw.fireAt === 'number' && Number.isFinite(raw.fireAt)
  if (hasDelay === hasAt) {
    fail('scheduler.schedule requires exactly one of delayMs or fireAt')
  }

  const repeat = normalizeRepeat(raw.repeat)
  if (repeat?.mode === 'interval' && (repeat.everyMs ?? 0) < MIN_INTERVAL_MS) {
    fail('interval repeat needs everyMs >= 1000')
  }

  const title = boundedString(raw.title, 'title', MAX_TITLE)
  const body = boundedString(raw.body, 'body', MAX_BODY)
  const icon = boundedString(raw.icon, 'icon', 32)
  const deepLink = boundedString(raw.deepLink, 'deepLink', MAX_DEEPLINK)

  const snoozeMs = raw.snoozeMs
  if (snoozeMs !== undefined && (typeof snoozeMs !== 'number' || !Number.isFinite(snoozeMs) || snoozeMs < 0)) {
    fail('snoozeMs must be a non-negative number')
  }
  if (raw.sound !== undefined && typeof raw.sound !== 'boolean') fail('sound must be a boolean')

  return {
    kind: kind as ScheduleKind,
    title: title?.trim() || 'Reminder',
    body,
    icon,
    deepLink,
    fireAt: hasDelay ? now + Math.max(0, raw.delayMs as number) : Math.floor(raw.fireAt as number),
    repeat,
    sound: (raw.sound as boolean | undefined) ?? (kind === 'alarm' || kind === 'timer'),
    snoozeMs: Math.max(0, (snoozeMs as number | undefined) ?? DEFAULT_SNOOZE_MS),
  }
}
