const DB_NAME = 'gfcode'
const BASE_STORES = ['profiles', 'meta', 'scheduler'] as const

function upgrade(db: IDBDatabase, extraStores: readonly string[]): void {
  if (!db.objectStoreNames.contains('profiles')) {
    db.createObjectStore('profiles', { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' })
  }
  if (!db.objectStoreNames.contains('scheduler')) {
    db.createObjectStore('scheduler', { keyPath: 'pk' })
  }
  for (const name of extraStores) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: 'pk' })
    }
  }
}

let connection: IDBDatabase | null = null
let pending: Promise<IDBDatabase> | null = null

function adopt(db: IDBDatabase): IDBDatabase {
  db.onversionchange = () => {
    db.close()
    if (connection === db) connection = null
  }
  connection = db
  return db
}

function missingStores(db: IDBDatabase, extraStores: readonly string[]): string[] {
  return extraStores.filter((name) => !db.objectStoreNames.contains(name))
}

function openRequest(version: number | undefined, extraStores: readonly string[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version)
    request.onupgradeneeded = () => upgrade(request.result, extraStores)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another connection'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function doOpen(extraStores: readonly string[]): Promise<IDBDatabase> {
  const stores = [...BASE_STORES, ...extraStores]
  const db = await openRequest(undefined, stores)
  const missing = missingStores(db, stores)
  if (missing.length === 0) return adopt(db)

  // Need an upgrade: close the current connection (the only one in this context)
  // so the version change is not blocked by ourselves.
  db.close()
  const upgraded = await openRequest(db.version + 1, stores)
  if (missingStores(upgraded, stores).length > 0) {
    upgraded.close()
    throw new Error('IndexedDB: failed to create required stores')
  }
  return adopt(upgraded)
}

export async function openDB(extraStores: readonly string[] = []): Promise<IDBDatabase> {
  if (connection && missingStores(connection, [...BASE_STORES, ...extraStores]).length === 0) {
    return connection
  }
  if (connection) {
    connection.close()
    connection = null
  }
  if (pending) {
    try {
      const db = await pending
      if (missingStores(db, [...BASE_STORES, ...extraStores]).length === 0) return db
    } catch {
      /* fall through and retry */
    }
  }
  pending = doOpen(extraStores)
  try {
    return await pending
  } finally {
    pending = null
  }
}

export function reqAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

export interface StoreSession {
  store: IDBObjectStore
  transaction: IDBTransaction
  done: Promise<void>
}

export async function getStore(
  storeName: string,
  mode: IDBTransactionMode = 'readonly',
): Promise<StoreSession> {
  const db = await openDB([storeName])
  const transaction = db.transaction(storeName, mode)
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction error'))
  })
  return { store: transaction.objectStore(storeName), transaction, done }
}
