import { describe, expect, it } from 'vitest'
import { DEFAULT_SNOOZE_MS, MAX_TITLE, nextOccurrence, normalizeDraft } from '../src/core/schedule-time'

function expectScheduleError(fn: () => unknown): void {
  try {
    fn()
  } catch (error) {
    expect((error as { code?: string }).code).toBe('E_SCHEDULE')
    return
  }
  throw new Error('expected an E_SCHEDULE error')
}

describe('nextOccurrence', () => {
  it('advances interval repeats by whole steps strictly after now', () => {
    expect(nextOccurrence(1_000, { mode: 'interval', everyMs: 1_000 }, 1_000)).toBe(2_000)
    expect(nextOccurrence(1_000, { mode: 'interval', everyMs: 1_000 }, 3_500)).toBe(4_000)
    expect(nextOccurrence(0, { mode: 'interval', everyMs: 60_000 }, 0)).toBe(60_000)
  })

  it('rejects intervals below the minimum', () => {
    expect(nextOccurrence(0, { mode: 'interval', everyMs: 10 }, 0)).toBeNull()
  })

  it('advances daily repeats to the same time the next day', () => {
    const base = new Date(2026, 0, 1, 9, 30, 0).getTime()
    const next = nextOccurrence(base, { mode: 'daily' }, base)
    expect(next).toBe(new Date(2026, 0, 2, 9, 30, 0).getTime())
  })

  it('skips forward for weekly repeats until a selected weekday', () => {
    const monday = new Date(2026, 0, 5, 8, 0, 0).getTime()
    // 2026-01-07 is a Wednesday (day 3).
    const next = nextOccurrence(monday, { mode: 'weekly', days: [3] }, monday)
    const date = new Date(next as number)
    expect(date.getDay()).toBe(3)
    expect(date.getTime()).toBeGreaterThan(monday)
  })

  it('skips weekends for weekdays repeats', () => {
    const friday = new Date(2026, 0, 2, 8, 0, 0).getTime()
    const next = new Date(nextOccurrence(friday, { mode: 'weekdays' }, friday) as number)
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(5)
  })
})

describe('normalizeDraft', () => {
  const now = 1_700_000_000_000

  it('resolves delayMs into an absolute fireAt', () => {
    const draft = normalizeDraft({ kind: 'timer', title: 'Tea', delayMs: 5_000 }, now)
    expect(draft.fireAt).toBe(now + 5_000)
    expect(draft.sound).toBe(true)
    expect(draft.snoozeMs).toBe(DEFAULT_SNOOZE_MS)
  })

  it('floors an explicit fireAt and defaults sound off for notifications', () => {
    const draft = normalizeDraft({ kind: 'notification', title: 'Ping', fireAt: now + 1_234.9 }, now)
    expect(draft.fireAt).toBe(now + 1_234)
    expect(draft.sound).toBe(false)
  })

  it('trims the title and falls back to a default when empty', () => {
    expect(normalizeDraft({ kind: 'alarm', title: '   ', delayMs: 0 }, now).title).toBe('Reminder')
    expect(normalizeDraft({ kind: 'alarm', title: '  Wake  ', delayMs: 0 }, now).title).toBe('Wake')
  })

  it('requires exactly one of delayMs or fireAt', () => {
    expectScheduleError(() => normalizeDraft({ kind: 'timer', title: 'x' }, now))
    expectScheduleError(() => normalizeDraft({ kind: 'timer', title: 'x', delayMs: 1, fireAt: now }, now))
  })

  it('validates kind', () => {
    expectScheduleError(() => normalizeDraft({ kind: 'bogus' as never, title: 'x', delayMs: 1 }, now))
  })

  it('rejects oversized titles', () => {
    expectScheduleError(() => normalizeDraft({ kind: 'timer', title: 'x'.repeat(MAX_TITLE + 1), delayMs: 1 }, now))
  })

  it('validates interval repeats', () => {
    expectScheduleError(() =>
      normalizeDraft({ kind: 'timer', title: 'x', delayMs: 1, repeat: { mode: 'interval', everyMs: 10 } }, now),
    )
    expect(() =>
      normalizeDraft({ kind: 'timer', title: 'x', delayMs: 1, repeat: { mode: 'interval', everyMs: 60_000 } }, now),
    ).not.toThrow()
  })

  it('validates weekly repeat days', () => {
    expectScheduleError(() =>
      normalizeDraft({ kind: 'timer', title: 'x', delayMs: 1, repeat: { mode: 'weekly', days: [7] } }, now),
    )
  })

  it('rejects negative snooze values', () => {
    expectScheduleError(() => normalizeDraft({ kind: 'alarm', title: 'x', delayMs: 1, snoozeMs: -10 }, now))
    expect(normalizeDraft({ kind: 'alarm', title: 'x', delayMs: 1, snoozeMs: 0 }, now).snoozeMs).toBe(0)
  })
})
