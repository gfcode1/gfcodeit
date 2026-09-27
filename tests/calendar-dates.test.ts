import { describe, expect, it } from 'vitest'
import { isSameMonth, monthMatrix, normalizeTime, pad, parseISODate, toISODate } from '../apps/calendar/src/dates'

describe('calendar dates', () => {
  it('pads to two digits', () => {
    expect(pad(3)).toBe('03')
    expect(pad(12)).toBe('12')
  })

  it('round-trips ISO dates', () => {
    const date = new Date(2026, 8, 19)
    expect(toISODate(date)).toBe('2026-09-19')
    expect(toISODate(parseISODate('2026-09-19') as Date)).toBe('2026-09-19')
  })

  it('rejects malformed ISO dates', () => {
    expect(parseISODate('19-09-2026')).toBeNull()
    expect(parseISODate('2026/09/19')).toBeNull()
  })

  it('builds a Monday-first 6-week matrix', () => {
    const cells = monthMatrix(2026, 8) // September 2026
    expect(cells).toHaveLength(42)
    expect(cells[0]?.getDay()).toBe(1) // Monday
    expect(isSameMonth(cells[0] as Date, 2026, 8)).toBe(false)
    expect(cells.some((date) => toISODate(date) === '2026-09-01')).toBe(true)
  })

  it('normalises 24h times', () => {
    expect(normalizeTime('9:05')).toBe('09:05')
    expect(normalizeTime('23:59')).toBe('23:59')
    expect(normalizeTime('24:00')).toBe('')
    expect(normalizeTime('10:60')).toBe('')
    expect(normalizeTime('')).toBe('')
  })
})
