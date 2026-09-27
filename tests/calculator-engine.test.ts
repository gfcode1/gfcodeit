import { describe, expect, it } from 'vitest'
import { evaluate, formatNumber, prettyExpression, rawNumber } from '../apps/calculator/src/engine'

describe('evaluate', () => {
  it('applies operator precedence', () => {
    expect(evaluate('2+3*4')).toEqual({ ok: true, value: 14 })
    expect(evaluate('(2+3)*4')).toEqual({ ok: true, value: 20 })
    expect(evaluate('2^3^2')).toEqual({ ok: true, value: 512 })
  })

  it('supports unicode operators and percentages', () => {
    expect(evaluate('6 ÷ 2')).toEqual({ ok: true, value: 3 })
    expect(evaluate('2 × 3')).toEqual({ ok: true, value: 6 })
    expect(evaluate('200*10%')).toEqual({ ok: true, value: 20 })
    expect(evaluate('50%')).toEqual({ ok: true, value: 0.5 })
  })

  it('handles unary signs', () => {
    expect(evaluate('-5')).toEqual({ ok: true, value: -5 })
    expect(evaluate('3 - -2')).toEqual({ ok: true, value: 5 })
  })

  it('reports errors without throwing', () => {
    expect(evaluate('')).toMatchObject({ ok: false })
    expect(evaluate('1/0')).toMatchObject({ ok: false, error: 'Division by zero' })
    expect(evaluate('2 +')).toMatchObject({ ok: false })
    expect(evaluate('2 @ 3')).toMatchObject({ ok: false })
    expect(evaluate('(1+2')).toMatchObject({ ok: false })
  })
})

describe('formatNumber', () => {
  it('groups thousands and trims trailing zeros', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234567.89)).toBe('1,234,567.89')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(-1234.5)).toBe('-1,234.5')
  })

  it('uses exponential notation for extreme magnitudes', () => {
    expect(formatNumber(1e13)).toContain('e')
    expect(formatNumber(1e-8)).toContain('e')
  })
})

describe('rawNumber / prettyExpression', () => {
  it('normalises negative zero', () => {
    expect(rawNumber(-0)).toBe('0')
    expect(rawNumber(3.5)).toBe('3.5')
  })

  it('pretty-prints operators', () => {
    expect(prettyExpression('1*2/3-4')).toBe('1×2÷3−4')
  })
})
