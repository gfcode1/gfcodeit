import type { ScheduleDraft, ScheduleItem, ScheduleRepeat } from './types'

export const MIN_INTERVAL_MS = 1_000
export const DEFAULT_SNOOZE_MS = 5 * 60_000

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
  const hasDelay = typeof draft.delayMs === 'number' && Number.isFinite(draft.delayMs)
  const hasAt = typeof draft.fireAt === 'number' && Number.isFinite(draft.fireAt)
  if (hasDelay === hasAt) {
    throw Object.assign(new Error('scheduler.schedule requires exactly one of delayMs or fireAt'), {
      code: 'E_SCHEDULE',
    })
  }
  const repeat = draft.repeat ?? null
  if (repeat?.mode === 'interval' && (repeat.everyMs ?? 0) < MIN_INTERVAL_MS) {
    throw Object.assign(new Error('interval repeat needs everyMs >= 1000'), { code: 'E_SCHEDULE' })
  }
  return {
    kind: draft.kind,
    title: draft.title?.trim() || 'Reminder',
    body: draft.body,
    icon: draft.icon,
    deepLink: draft.deepLink,
    fireAt: hasDelay ? now + Math.max(0, draft.delayMs as number) : Math.floor(draft.fireAt as number),
    repeat,
    sound: draft.sound ?? (draft.kind === 'alarm' || draft.kind === 'timer'),
    snoozeMs: Math.max(0, draft.snoozeMs ?? DEFAULT_SNOOZE_MS),
  }
}
