import type { StorageHandle } from './storage'

/** Prefix appended to every persisted cache key, e.g. `__cache__:channels`. */
export const CACHE_KEY_PREFIX = '__cache__:'

export interface CacheEntry<T = unknown> {
  v: 1
  key: string
  url: string
  data: T
  cachedAt: number
  /** End of the fresh window; before this the value is returned without any network call. */
  expiresAt: number
  /** End of the stale window; after this the value is pruned and never served offline. */
  staleUntil: number
}

export interface CacheHit<T> {
  data: T
  cachedAt: number
  expiresAt: number
}

export interface CacheOptions {
  /** Fresh window in ms (default 5 min). */
  ttlMs?: number
  /** Extra window after `ttlMs` where stale data is served while revalidating (default 24 h). */
  staleTtlMs?: number
  /** Persist to IndexedDB; `false` keeps the entry in memory only (default true). */
  persist?: boolean
  /** Abort signal; when provided the request is never deduplicated so aborts are exact. */
  signal?: AbortSignal
  /** Skip the cached value and force a network read (falls back to cache on failure). */
  force?: boolean
}

export interface GFCacheApi {
  fetchJson<T>(key: string, url: string, options?: CacheOptions): Promise<T>
  fetchText(key: string, url: string, options?: CacheOptions): Promise<string>
  get<T>(key: string): Promise<CacheHit<T> | undefined>
  set<T>(key: string, data: T, ttlMs?: number): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
  /** Drops entries past their stale window; returns how many were removed. */
  prune(): Promise<number>
}

export interface CacheConfig {
  /** Persistent layer. Omit for an in-memory-only cache. */
  storage?: StorageHandle
  /** In-memory entry cap; oldest entries are evicted first. */
  maxEntries?: number
}

const DEFAULT_TTL_MS = 5 * 60_000
const DEFAULT_STALE_TTL_MS = 24 * 60 * 60_000

/** Carries the HTTP status so callers can duck-type it across bundle boundaries. */
export class HttpError extends Error {
  readonly status: number
  constructor(url: string, status: number) {
    super(`${url} → HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError'
}

export function createCache(config: CacheConfig = {}): GFCacheApi {
  const storage = config.storage
  const maxEntries = config.maxEntries ?? 200
  const memory = new Map<string, CacheEntry>()
  const inflight = new Map<string, Promise<unknown>>()

  async function read<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const hot = memory.get(key)
    if (hot) return hot as CacheEntry<T>
    if (!storage) return undefined
    try {
      const entry = await storage.get<CacheEntry<T>>(CACHE_KEY_PREFIX + key)
      if (!entry || entry.v !== 1 || typeof entry.staleUntil !== 'number') return undefined
      memory.set(key, entry)
      return entry
    } catch {
      return undefined
    }
  }

  async function removePersisted(key: string): Promise<void> {
    if (!storage) return
    try {
      await storage.delete(CACHE_KEY_PREFIX + key)
    } catch {
      /* best effort */
    }
  }

  function enforceLimit(): void {
    if (memory.size <= maxEntries) return
    const oldest = [...memory.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)
    for (const [key] of oldest.slice(0, memory.size - maxEntries)) {
      memory.delete(key)
      void removePersisted(key)
    }
  }

  async function write<T>(
    key: string,
    url: string,
    data: T,
    ttlMs: number,
    staleTtlMs: number,
    persist: boolean,
  ): Promise<void> {
    const now = Date.now()
    const entry: CacheEntry<T> = {
      v: 1,
      key,
      url,
      data,
      cachedAt: now,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs + staleTtlMs,
    }
    memory.set(key, entry)
    enforceLimit()
    if (persist && storage) {
      try {
        await storage.set(CACHE_KEY_PREFIX + key, entry)
      } catch {
        /* degrade to memory-only */
      }
    }
  }

  function load(
    key: string,
    url: string,
    fetcher: (signal?: AbortSignal) => Promise<unknown>,
    ttlMs: number,
    staleTtlMs: number,
    persist: boolean,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    // Requests without a signal are deduplicated; with a signal the caller owns
    // cancellation, so a shared promise would swallow its abort.
    if (!signal) {
      const existing = inflight.get(key)
      if (existing) return existing
    }
    const promise = (async () => {
      const data = await fetcher(signal)
      await write(key, url, data, ttlMs, staleTtlMs, persist)
      return data
    })()
    if (!signal) {
      inflight.set(key, promise)
      const done = (): void => {
        if (inflight.get(key) === promise) inflight.delete(key)
      }
      void promise.then(done, done)
    }
    return promise
  }

  function revalidate(
    key: string,
    url: string,
    fetcher: (signal?: AbortSignal) => Promise<unknown>,
    ttlMs: number,
    staleTtlMs: number,
    persist: boolean,
  ): void {
    void load(key, url, fetcher, ttlMs, staleTtlMs, persist, undefined).catch(() => undefined)
  }

  async function fetchWith<T>(
    key: string,
    url: string,
    options: CacheOptions | undefined,
    fetcher: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const opts = options ?? {}
    const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
    const staleTtlMs = opts.staleTtlMs ?? DEFAULT_STALE_TTL_MS
    const persist = opts.persist ?? true
    const now = Date.now()
    const cached = await read<T>(key)

    if (cached && !opts.force) {
      if (now < cached.expiresAt) return cached.data
      if (now < cached.staleUntil) {
        revalidate(key, url, fetcher, ttlMs, staleTtlMs, persist)
        return cached.data
      }
    }

    try {
      return (await load(key, url, fetcher, ttlMs, staleTtlMs, persist, opts.signal)) as T
    } catch (error) {
      if (isAbortError(error)) throw error
      if (cached && now < cached.staleUntil) return cached.data
      throw error
    }
  }

  return {
    fetchJson<T>(key: string, url: string, options?: CacheOptions): Promise<T> {
      return fetchWith<T>(key, url, options, async (signal) => {
        const response = await fetch(url, { signal })
        if (!response.ok) throw new HttpError(url, response.status)
        return (await response.json()) as T
      })
    },
    fetchText(key, url, options) {
      return fetchWith<string>(key, url, options, async (signal) => {
        const response = await fetch(url, { signal })
        if (!response.ok) throw new HttpError(url, response.status)
        return response.text()
      })
    },
    async get<T>(key: string): Promise<CacheHit<T> | undefined> {
      const entry = await read<T>(key)
      if (!entry) return undefined
      return { data: entry.data, cachedAt: entry.cachedAt, expiresAt: entry.expiresAt }
    },
    set(key, data, ttlMs) {
      return write(key, '', data, ttlMs ?? DEFAULT_TTL_MS, 0, true)
    },
    async remove(key) {
      memory.delete(key)
      await removePersisted(key)
    },
    async clear() {
      memory.clear()
      inflight.clear()
      if (!storage) return
      try {
        const keys = await storage.keys()
        for (const key of keys) {
          if (key.startsWith(CACHE_KEY_PREFIX)) await storage.delete(key)
        }
      } catch {
        /* best effort */
      }
    },
    async prune() {
      const now = Date.now()
      let removed = 0
      for (const [key, entry] of memory) {
        if (now >= entry.staleUntil) {
          memory.delete(key)
          removed += 1
        }
      }
      if (storage) {
        try {
          const keys = await storage.keys()
          for (const key of keys) {
            if (!key.startsWith(CACHE_KEY_PREFIX)) continue
            const entry = await storage.get<CacheEntry>(key)
            if (entry && entry.v === 1 && now >= entry.staleUntil) {
              await storage.delete(key)
              removed += 1
            }
          }
        } catch {
          /* best effort */
        }
      }
      return removed
    },
  }
}
