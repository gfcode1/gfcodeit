import { describe, expect, it } from 'vitest'
import { BridgeError, rangeSatisfies } from '../src/core/bridge-protocol'

describe('rangeSatisfies', () => {
  it('handles caret ranges within the same major', () => {
    expect(rangeSatisfies('1.0.0', '^1.0.0')).toBe(true)
    expect(rangeSatisfies('1.5.3', '^1.0.0')).toBe(true)
    expect(rangeSatisfies('2.0.0', '^1.0.0')).toBe(false)
    expect(rangeSatisfies('0.9.0', '^1.0.0')).toBe(false)
  })

  it('handles tilde ranges within the same major.minor', () => {
    expect(rangeSatisfies('1.0.0', '~1.0.0')).toBe(true)
    expect(rangeSatisfies('1.0.9', '~1.0.0')).toBe(true)
    expect(rangeSatisfies('1.1.0', '~1.0.0')).toBe(false)
  })

  it('handles comparison operators', () => {
    expect(rangeSatisfies('1.0.0', '>=1.0.0')).toBe(true)
    expect(rangeSatisfies('0.9.0', '>=1.0.0')).toBe(false)
    expect(rangeSatisfies('1.0.0', '>1.0.0')).toBe(false)
    expect(rangeSatisfies('2.0.0', '<2.0.0')).toBe(false)
    expect(rangeSatisfies('1.9.9', '<=1.9.9')).toBe(true)
  })

  it('handles exact versions and ignores a leading v', () => {
    expect(rangeSatisfies('1.0.0', '1.0.0')).toBe(true)
    expect(rangeSatisfies('1.0.1', '1.0.0')).toBe(false)
    expect(rangeSatisfies('1.0.0', 'v1.0.0')).toBe(true)
  })
})

describe('BridgeError', () => {
  it('carries the code and message', () => {
    const error = new BridgeError({ code: 'E_TIMEOUT', message: 'timed out' })
    expect(error.name).toBe('BridgeError')
    expect(error.code).toBe('E_TIMEOUT')
    expect(error.message).toBe('timed out')
  })
})
