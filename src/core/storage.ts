import { getStore, reqAsPromise } from './idb'
import type { StorageScope } from './types'

export type UpgradeFn = (
  from: number,
  to: number,
  ctx: { appId: string; scope: StorageScope },
) => void | Promise<void>

export interface StorageHandle {
  readonly scope: StorageScope
  get<T>(key: string, fallback?: T): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
  onUpgrade(fn: UpgradeFn): void
  init(): Promise<void>
}

interface KvRecord {
  pk: string
  value: unknown
}

interface MetaRecord {
  key: string
  versions: Record<string, number>
}

export interface StorageOptions {
  appId: string
  scope: StorageScope
  schemaVersion: number
  getProfileId: () => string
}

export class StorageError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'StorageError'
    this.code = code
  }
}

function rethrowWrite(error: unknown): never {
  const name = (error as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') {
    throw new StorageError('E_QUOTA', 'Storage quota exceeded')
  }
  if (name === 'DataCloneError') {
    throw new StorageError('E_CLONE', 'Value is not structured-cloneable')
  }
  throw error
}

const SHARED = '*'
const META_KEY = 'meta'

export function createStorage(options: StorageOptions): StorageHandle {
  const storeName = `app_${options.appId}`
  let upgrader: UpgradeFn | undefined
  let ready: Promise<void> | null = null

  function prefix(): string {
    const owner = options.scope === 'shared' ? SHARED : options.getProfileId()
    return `${owner}::`
  }

  function versionKey(): string {
    return options.scope === 'shared' ? 'shared' : `profile:${options.getProfileId()}`
  }

  async function runMigrations(): Promise<void> {
    const { store, done } = await getStore(META_KEY, 'readwrite')
    const record = (await reqAsPromise(store.get(options.appId))) as MetaRecord | undefined
    const versions: Record<string, number> = record?.versions ?? {}
    const key = versionKey()
    const current = versions[key]

    if (current === undefined) {
      versions[key] = options.schemaVersion
      store.put({ key: options.appId, versions })
      await done
      return
    }
    if (current === options.schemaVersion) {
      await done
      return
    }
    if (current > options.schemaVersion) {
      throw new Error(
        `E_MIGRATION: ${options.appId} stored schema v${current} is newer than manifest v${options.schemaVersion}`,
      )
    }
    if (!upgrader) {
      throw new Error(
        `E_MIGRATION: missing upgrade handler for ${options.appId} (${current} -> ${options.schemaVersion})`,
      )
    }
    await upgrader(current, options.schemaVersion, { appId: options.appId, scope: options.scope })
    versions[key] = options.schemaVersion
    store.put({ key: options.appId, versions })
    await done
  }

  function init(): Promise<void> {
    if (!ready) {
      ready = runMigrations().catch((error: unknown) => {
        // Allow a later retry instead of caching a permanently rejected promise.
        ready = null
        throw error
      })
    }
    return ready
  }

  async function get<T>(key: string, fallback?: T): Promise<T | undefined> {
    await init()
    const { store, done } = await getStore(storeName)
    const record = (await reqAsPromise(store.get(prefix() + key))) as KvRecord | undefined
    await done
    return record ? (record.value as T) : fallback
  }

  async function set<T>(key: string, value: T): Promise<void> {
    await init()
    try {
      const { store, done } = await getStore(storeName, 'readwrite')
      store.put({ pk: prefix() + key, value } satisfies KvRecord)
      await done
    } catch (error) {
      rethrowWrite(error)
    }
  }

  async function remove(key: string): Promise<void> {
    await init()
    try {
      const { store, done } = await getStore(storeName, 'readwrite')
      store.delete(prefix() + key)
      await done
    } catch (error) {
      rethrowWrite(error)
    }
  }

  async function keys(): Promise<string[]> {
    await init()
    const { store, done } = await getStore(storeName)
    const all = (await reqAsPromise(store.getAllKeys())) as IDBValidKey[]
    await done
    const p = prefix()
    return all
      .map((k) => String(k))
      .filter((k) => k.startsWith(p))
      .map((k) => k.slice(p.length))
  }

  async function clear(): Promise<void> {
    await init()
    const { store, done } = await getStore(storeName, 'readwrite')
    const all = (await reqAsPromise(store.getAllKeys())) as IDBValidKey[]
    const p = prefix()
    for (const k of all) {
      if (String(k).startsWith(p)) store.delete(k)
    }
    await done
  }

  return {
    scope: options.scope,
    get,
    set,
    delete: remove,
    keys,
    clear,
    onUpgrade(fn: UpgradeFn) {
      upgrader = fn
    },
    init,
  }
}
