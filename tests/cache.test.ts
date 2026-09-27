import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache, HttpError } from '../src/core/cache'

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) } as Response
}

describe('createCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('caches a fetchJson response within the fresh window', async () => {
    const cache = createCache()
    const fetchMock = vi.fn(async () => jsonResponse({ value: 1 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 1_000 })).toEqual({ value: 1 })
    vi.advanceTimersByTime(500)
    expect(await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 1_000 })).toEqual({ value: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves stale data while revalidating in the background', async () => {
    const cache = createCache()
    const fetchMock = vi.fn(async () => jsonResponse({ n: fetchMock.mock.calls.length }))
    vi.stubGlobal('fetch', fetchMock)

    await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 0, staleTtlMs: 10_000 })
    vi.advanceTimersByTime(1)
    const stale = await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 0, staleTtlMs: 10_000 })
    expect(stale).toEqual({ n: 1 })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('force bypasses a fresh entry', async () => {
    const cache = createCache()
    const fetchMock = vi.fn(async () => jsonResponse({ v: fetchMock.mock.calls.length }))
    vi.stubGlobal('fetch', fetchMock)

    await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 10_000 })
    const forced = await cache.fetchJson('k', 'https://example.test/a', { ttlMs: 10_000, force: true })
    expect(forced).toEqual({ v: 2 })
  })

  it('deduplicates concurrent requests for the same key', async () => {
    const cache = createCache()
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      cache.fetchJson('k', 'https://example.test/a'),
      cache.fetchJson('k', 'https://example.test/a'),
    ])
    expect(a).toEqual(b)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws an HttpError carrying the status', async () => {
    const cache = createCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, false, 404)),
    )
    await expect(cache.fetchJson('k', 'https://example.test/missing')).rejects.toBeInstanceOf(HttpError)
    await expect(cache.fetchJson('k', 'https://example.test/missing')).rejects.toMatchObject({ status: 404 })
  })

  it('rethrows abort errors instead of falling back to cache', async () => {
    const cache = createCache()
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(abort)),
    )
    await expect(
      cache.fetchJson('k', 'https://example.test/a', { signal: new AbortController().signal }),
    ).rejects.toThrow('aborted')
  })

  it('supports explicit set/get/remove/clear', async () => {
    const cache = createCache()
    await cache.set('greeting', 'hello', 1_000)
    expect((await cache.get<string>('greeting'))?.data).toBe('hello')
    await cache.remove('greeting')
    expect(await cache.get('greeting')).toBeUndefined()

    await cache.set('a', 1, 1_000)
    await cache.clear()
    expect(await cache.get('a')).toBeUndefined()
  })

  it('prunes entries past their stale window', async () => {
    const cache = createCache()
    await cache.set('short', 'x', 100)
    vi.advanceTimersByTime(200)
    expect(await cache.prune()).toBe(1)
    expect(await cache.get('short')).toBeUndefined()
  })
})
