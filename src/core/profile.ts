import { getStore, reqAsPromise } from './idb'
import type { Profile, RecentEntry, ThemeMode } from './types'

const CURRENT_KEY = 'gf:currentProfile'
const THEME_KEY = 'gf:theme'
const PROFILES_STORE = 'profiles'
const MAX_RECENT = 6

export const ACCENTS = [
  '#ff4d00',
  '#0057ff',
  '#00a06b',
  '#d4007a',
  '#7a00ff',
  '#b58a00',
  '#008b8b',
  '#c02626',
] as const

export function pickAccent(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return ACCENTS[hash % ACCENTS.length]!
}

async function listAll(): Promise<Profile[]> {
  const { store, done } = await getStore(PROFILES_STORE)
  const records = (await reqAsPromise(store.getAll())) as Profile[]
  await done
  return records.sort((a, b) => a.createdAt - b.createdAt)
}

export async function listProfiles(): Promise<Profile[]> {
  return listAll()
}

export async function getProfile(id: string): Promise<Profile | undefined> {
  const { store, done } = await getStore(PROFILES_STORE)
  const record = (await reqAsPromise(store.get(id))) as Profile | undefined
  await done
  return record
}

export async function saveProfile(profile: Profile): Promise<void> {
  const { store, done } = await getStore(PROFILES_STORE, 'readwrite')
  store.put(profile)
  await done
}

export function getCurrentId(): string {
  return localStorage.getItem(CURRENT_KEY) ?? ''
}

export function setCurrentId(id: string): void {
  localStorage.setItem(CURRENT_KEY, id)
}

export function getThemeFallback(): ThemeMode {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function setThemeFallback(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
}

export async function ensureDefaultProfile(): Promise<Profile> {
  const profiles = await listAll()
  if (profiles.length > 0) {
    const current = getCurrentId()
    if (current && profiles.some((p) => p.id === current)) return profiles.find((p) => p.id === current)!
    setCurrentId(profiles[0]!.id)
    return profiles[0]!
  }
  const now = Date.now()
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: 'Default',
    avatar: '1F464',
    accent: ACCENTS[0],
    themeMode: getThemeFallback(),
    isDefault: true,
    createdAt: now,
    lastUsedAt: now,
    favorites: [],
    recent: [],
  }
  await saveProfile(profile)
  setCurrentId(profile.id)
  return profile
}

export async function getCurrentProfile(): Promise<Profile> {
  const id = getCurrentId()
  if (id) {
    const profile = await getProfile(id)
    if (profile) return profile
  }
  return ensureDefaultProfile()
}

export async function createProfile(input: Partial<Profile> & { name: string }): Promise<Profile> {
  const now = Date.now()
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: input.name,
    avatar: input.avatar ?? '1F464',
    accent: input.accent ?? pickAccent(input.name),
    themeMode: input.themeMode ?? getThemeFallback(),
    isDefault: false,
    createdAt: now,
    lastUsedAt: now,
    favorites: input.favorites ?? [],
    recent: input.recent ?? [],
  }
  await saveProfile(profile)
  return profile
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<Profile> {
  const existing = await getProfile(id)
  if (!existing) throw new Error(`E_PROFILE: profile ${id} not found`)
  const next: Profile = { ...existing, ...patch, id: existing.id }
  await saveProfile(next)
  return next
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await listAll()
  const target = profiles.find((p) => p.id === id)
  if (!target) return
  if (target.isDefault) throw new Error('E_PROFILE: cannot delete the default profile')
  const { store, done } = await getStore(PROFILES_STORE, 'readwrite')
  store.delete(id)
  await done
  if (getCurrentId() === id) {
    const fallback = profiles.find((p) => p.id !== id)
    if (fallback) setCurrentId(fallback.id)
  }
}

export async function addRecent(appId: string): Promise<void> {
  const profile = await getCurrentProfile()
  const recent: RecentEntry[] = [
    { appId, at: Date.now() },
    ...profile.recent.filter((r) => r.appId !== appId),
  ].slice(0, MAX_RECENT)
  await saveProfile({ ...profile, recent, lastUsedAt: Date.now() })
}

export async function toggleFavorite(appId: string): Promise<string[]> {
  const profile = await getCurrentProfile()
  const favorites = profile.favorites.includes(appId)
    ? profile.favorites.filter((id) => id !== appId)
    : [...profile.favorites, appId]
  await saveProfile({ ...profile, favorites })
  return favorites
}

export async function setFavorites(appIds: string[]): Promise<void> {
  const profile = await getCurrentProfile()
  await saveProfile({ ...profile, favorites: appIds })
}
