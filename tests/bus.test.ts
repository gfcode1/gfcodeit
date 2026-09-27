import { describe, expect, it, vi } from 'vitest'
import { Emitter } from '../src/core/bus'

describe('Emitter', () => {
  it('delivers payloads to subscribers of the same channel only', () => {
    const bus = new Emitter()
    const a = vi.fn()
    const b = vi.fn()
    bus.on('x', a)
    bus.on('y', b)
    bus.emit('x', 1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('unsubscribes via the returned function and off()', () => {
    const bus = new Emitter()
    const handler = vi.fn()
    const off = bus.on('x', handler)
    off()
    bus.emit('x', 1)
    expect(handler).not.toHaveBeenCalled()

    bus.on('x', handler)
    bus.off('x', handler)
    bus.emit('x', 2)
    expect(handler).not.toHaveBeenCalled()
  })

  it('keeps a stable snapshot while emitting', () => {
    const bus = new Emitter()
    const late = vi.fn()
    const first = vi.fn(() => bus.on('x', late))
    bus.on('x', first)
    bus.emit('x', 1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(late).not.toHaveBeenCalled()
    bus.emit('x', 2)
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('clear() drops every subscription', () => {
    const bus = new Emitter()
    const handler = vi.fn()
    bus.on('x', handler)
    bus.clear()
    bus.emit('x', 1)
    expect(handler).not.toHaveBeenCalled()
  })
})
