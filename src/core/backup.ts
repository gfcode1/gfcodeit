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
const MAX_BACKUP_BYTES = 32 * 1024 * 1024
const MAX_PROFILES = 100
const MAX_ENTRIES = 50_000

const APP_ID = /^[a-z][a-z0-9-]{1,63}$/
const OWNER = /^([0-9a-fA-F]{8}-[0-9a-fA-F-]{20,}|default|\*)$/
const PROFILE_ID = /^[0-9a-fA-F-]{8,64}$/
const THEME_MODES = new Set(['light', 'dark', 'system'])

function backupError(message: string): never {
  throw new Error(`E_BACKUP: ${message}`)
}

/** Rebuilds a profile from known fields so a crafted file cannot inject extras. */
function sanitizeProfile(value: unknown): Profile {
  if (typeof value !== 'object' || value === null) backupError('malformed profile')
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !PROFILE_ID.test(raw.id)) backupError('malformed profile id')
  if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > 64) {
    backupError('malformed profile name')
  }
  const now = Date.now()
  const favorites = Array.isArray(raw.favorites)
    ? raw.favorites.filter((id): id is string => typeof id === 'string').slice(0, 200)
    : []
  const recent = Array.isArray(raw.recent)
    ? raw.recent
        .filter(
          (entry): entry is { appId: string; at: number } =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { appId?: unknown }).appId === 'string' &&
            typeof (entry as { at?: unknown }).at === 'number',
        )
        .slice(0, 50)
    : []
  return {
    id: raw.id,
    name: raw.name.slice(0, 64),
    avatar: typeof raw.avatar === 'string' ? raw.avatar.slice(0, 32) : '1F464',
    accent: typeof raw.accent === 'string' ? raw.accent.slice(0, 64) : '#ff4d00',
    themeMode:
      typeof raw.themeMode === 'string' && THEME_MODES.has(raw.themeMode)
        ? (raw.themeMode as Profile['themeMode'])
        : 'system',
    isDefault: raw.isDefault === true,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    lastUsedAt: typeof raw.lastUsedAt === 'number' && Number.isFinite(raw.lastUsedAt) ? raw.lastUsedAt : now,
    favorites,
    recent,
  }
}

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
  const rawProfiles = file.profiles ?? []
  if (!Array.isArray(rawProfiles) || rawProfiles.length > MAX_PROFILES) {
    throw new Error('E_BACKUP: malformed profiles section')
  }
  const profiles = rawProfiles.map(sanitizeProfile)

  const rawData = file.data ?? {}
  if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) {
    throw new Error('E_BACKUP: malformed data section')
  }

  let count = 0
  const data: AppData = {}
  for (const [appId, owners] of Object.entries(rawData)) {
    if (!APP_ID.test(appId)) backupError(`invalid app id "${appId}"`)
    if (typeof owners !== 'object' || owners === null || Array.isArray(owners)) {
      backupError('malformed app data')
    }
    const cleanOwners: Record<string, Record<string, unknown>> = {}
    for (const [owner, entries] of Object.entries(owners as Record<string, unknown>)) {
      if (!OWNER.test(owner)) backupError(`invalid data owner "${owner}"`)
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
        backupError('malformed owner data')
      }
      const cleanEntries: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
        if (key.length === 0 || key.length > 512) backupError('invalid data key')
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          backupError('reserved data key')
        }
        if (key.startsWith(CACHE_KEY_PREFIX)) continue
        count += 1
        if (count > MAX_ENTRIES) backupError(`too many entries (max ${MAX_ENTRIES})`)
        cleanEntries[key] = value
      }
      cleanOwners[owner] = cleanEntries
    }
    data[appId] = cleanOwners
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
  if (file.size > MAX_BACKUP_BYTES) throw new Error('E_BACKUP: backup file too large')
  const text = await file.text()
  return JSON.parse(text) as BackupFile
}
