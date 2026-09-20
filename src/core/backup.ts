import { openDB, reqAsPromise } from './idb'
import { CACHE_KEY_PREFIX } from './cache'
import type { Profile } from './types'

export const BACKUP_VERSION = 1

export type BackupType = 'full' | 'profile' | 'app'

/** appId → owner (`profileId` or `*` for shared) → key → value */
export type AppData = Record<string, Record<string, Record<string, unknown>>>

export interface BackupFile {
  gfc: number
  type: BackupType
  exportedAt: number
  profiles: Profile[]
  data: AppData
}

interface KvRecord {
  pk: string
  value: unknown
}

const SHARED = '*'

async function readAppData(filter?: (appId: string, owner: string) => boolean): Promise<AppData> {
  const db = await openDB()
  const data: AppData = {}
  for (const name of Array.from(db.objectStoreNames)) {
    if (!name.startsWith('app_')) continue
    const appId = name.slice('app_'.length)
    const transaction = db.transaction(name, 'readonly')
    const records = (await reqAsPromise(transaction.objectStore(name).getAll())) as KvRecord[]
    for (const record of records) {
      const separator = record.pk.indexOf('::')
      if (separator < 0) continue
      const owner = record.pk.slice(0, separator)
      const key = record.pk.slice(separator + 2)
      if (key.startsWith(CACHE_KEY_PREFIX)) continue
      if (filter && !filter(appId, owner)) continue
      data[appId] ??= {}
      data[appId][owner] ??= {}
      data[appId][owner][key] = record.value
    }
  }
  return data
}

async function readProfiles(): Promise<Profile[]> {
  const db = await openDB()
  const transaction = db.transaction('profiles', 'readonly')
  return (await reqAsPromise(transaction.objectStore('profiles').getAll())) as Profile[]
}

export async function exportAll(): Promise<BackupFile> {
  return {
    gfc: BACKUP_VERSION,
    type: 'full',
    exportedAt: Date.now(),
    profiles: await readProfiles(),
    data: await readAppData(),
  }
}

export async function exportProfile(profileId: string): Promise<BackupFile> {
  const profiles = (await readProfiles()).filter((p) => p.id === profileId)
  const data = await readAppData((_appId, owner) => owner === profileId)
  return { gfc: BACKUP_VERSION, type: 'profile', exportedAt: Date.now(), profiles, data }
}

export async function exportApp(appId: string, profileId?: string): Promise<BackupFile> {
  const data = await readAppData((id, owner) => id === appId && (!profileId || owner === profileId || owner === SHARED))
  const profiles = profileId ? (await readProfiles()).filter((p) => p.id === profileId) : []
  return { gfc: BACKUP_VERSION, type: 'app', exportedAt: Date.now(), profiles, data }
}

export type ImportMode = 'merge' | 'replace'

async function writeProfiles(profiles: Profile[], mode: ImportMode): Promise<void> {
  if (profiles.length === 0) return
  const db = await openDB(['profiles'])
  const transaction = db.transaction('profiles', 'readwrite')
  const store = transaction.objectStore('profiles')
  for (const profile of profiles) store.put(profile)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
  void mode
}

async function writeAppData(data: AppData, mode: ImportMode): Promise<void> {
  const appIds = Object.keys(data)
  if (appIds.length === 0) return
  const db = await openDB(appIds.map((id) => `app_${id}`))
  for (const appId of appIds) {
    const storeName = `app_${appId}`
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const owners = data[appId] ?? {}

    if (mode === 'replace') {
      const existing = (await reqAsPromise(store.getAllKeys())) as IDBValidKey[]
      const prefixes = Object.keys(owners).map((owner) => `${owner}::`)
      for (const key of existing) {
        if (prefixes.some((prefix) => String(key).startsWith(prefix))) store.delete(key)
      }
    }

    for (const [owner, entries] of Object.entries(owners)) {
      for (const [key, value] of Object.entries(entries)) {
        store.put({ pk: `${owner}::${key}`, value } satisfies KvRecord)
      }
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

export async function importBackup(file: BackupFile, mode: ImportMode = 'merge'): Promise<void> {
  if (!file || typeof file !== 'object' || file.gfc !== BACKUP_VERSION) {
    throw new Error('E_BACKUP: unsupported or invalid backup file')
  }
  const profiles = file.profiles ?? []
  if (!Array.isArray(profiles) || profiles.some((p) => !p || typeof p.id !== 'string')) {
    throw new Error('E_BACKUP: malformed profiles section')
  }
  const data = file.data ?? {}
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('E_BACKUP: malformed data section')
  }
  for (const owners of Object.values(data)) {
    if (typeof owners !== 'object' || owners === null) {
      throw new Error('E_BACKUP: malformed app data')
    }
  }
  await writeProfiles(profiles, mode)
  await writeAppData(data, mode)
}

export function downloadBackup(file: BackupFile, filename: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text()
  return JSON.parse(text) as BackupFile
}
