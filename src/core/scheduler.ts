import { getStore, reqAsPromise } from './idb'
import { DEFAULT_SNOOZE_MS, nextOccurrence, normalizeDraft } from './schedule-time'
import type { ScheduleDraft, ScheduleItem } from './types'

/**
 * Central scheduler owned by the shell. Apps talk to it over the bridge; the
 * shell is the only context guaranteed to stay mounted, so persistence and
 * firing live here (see docs/AGENTS: app iframes are unmounted in background).
 */

const STORE = 'scheduler'
const SAFETY_INTERVAL_MS = 30_000
const MISSED_GRACE_MS = 60_000
const MAX_TIMEOUT_MS = 2 ** 31 - 1
const MAX_PENDING_PER_APP = 100

interface ScheduleRecord {
  pk: string
  item: ScheduleItem
}

export type FiredHandler = (item: ScheduleItem) => void

export class Scheduler {
  private items = new Map<string, ScheduleItem>()
  private handlers = new Set<FiredHandler>()
  private profileId = 'default'
  private fireTimer: number | null = null
  private safetyTimer: number | null = null
  private started = false
  private running = false

  onFired(handler: FiredHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  get currentProfileId(): string {
    return this.profileId
  }

  get pendingCount(): number {
    let count = 0
    for (const item of this.items.values()) if (item.status === 'pending') count += 1
    return count
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.safetyTimer = window.setInterval(() => void this.checkDue(), SAFETY_INTERVAL_MS)
    this.arm()
  }

  stop(): void {
    this.started = false
    if (this.fireTimer !== null) window.clearTimeout(this.fireTimer)
    if (this.safetyTimer !== null) window.clearInterval(this.safetyTimer)
    this.fireTimer = null
    this.safetyTimer = null
  }

  async load(profileId: string): Promise<void> {
    this.profileId = profileId
    const records = await this.readAll()
    this.items.clear()
    for (const item of records) {
      if (item.status === 'pending') {
        if (item.profileId === profileId) this.items.set(item.id, item)
      } else {
        // Fired/dismissed entries are transient; drop them so storage does not grow.
        await this.deleteRecord(item.id)
      }
    }
    await this.checkDue()
    this.arm()
  }

  async schedule(appId: string, draft: ScheduleDraft): Promise<ScheduleItem> {
    let pending = 0
    for (const existing of this.items.values()) {
      if (existing.appId === appId && existing.status === 'pending') pending += 1
    }
    if (pending >= MAX_PENDING_PER_APP) {
      throw Object.assign(new Error(`Too many pending reminders (max ${MAX_PENDING_PER_APP})`), {
        code: 'E_SCHEDULE',
      })
    }
    const now = Date.now()
    const item: ScheduleItem = {
      ...normalizeDraft(draft),
      id: crypto.randomUUID(),
      appId,
      profileId: this.profileId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    await this.persist(item)
    this.items.set(item.id, item)
    this.arm()
    return item
  }

  async cancel(appId: string, id: string): Promise<boolean> {
    const current = this.items.get(id)
    if (!current || current.appId !== appId) return false
    this.items.delete(id)
    await this.deleteRecord(id)
    this.arm()
    return true
  }

  /** Clears a fired entry. Repeating entries stay scheduled for their next run. */
  async dismiss(appId: string, id: string): Promise<boolean> {
    const current = this.items.get(id)
    if (!current || current.appId !== appId) return false
    if (current.status === 'pending') return false
    this.items.delete(id)
    await this.deleteRecord(id)
    this.arm()
    return true
  }

  async snooze(appId: string, id: string, ms?: number): Promise<boolean> {
    const current = this.items.get(id)
    if (!current || current.appId !== appId) return false
    const now = Date.now()
    const next: ScheduleItem = {
      ...current,
      fireAt: now + Math.max(0, ms ?? current.snoozeMs ?? DEFAULT_SNOOZE_MS),
      status: 'pending',
      missed: false,
      updatedAt: now,
    }
    await this.persist(next)
    this.items.set(id, next)
    this.arm()
    return true
  }

  async list(appId?: string): Promise<ScheduleItem[]> {
    return [...this.items.values()]
      .filter((item) => !appId || item.appId === appId)
      .sort((a, b) => a.fireAt - b.fireAt)
  }

  async clear(appId?: string): Promise<void> {
    for (const item of [...this.items.values()]) {
      if (!appId || item.appId === appId) {
        this.items.delete(item.id)
        await this.deleteRecord(item.id)
      }
    }
    this.arm()
  }

  async checkDue(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const now = Date.now()
      const due = [...this.items.values()]
        .filter((item) => item.status === 'pending' && item.fireAt <= now)
        .sort((a, b) => a.fireAt - b.fireAt)

      for (const item of due) {
        const next = item.repeat ? nextOccurrence(item.fireAt, item.repeat, now) : null
        const claimed = await this.claim(item.id, item.fireAt, now, next, now - item.fireAt > MISSED_GRACE_MS)
        if (!claimed) {
          // Another tab already fired it (or it was cancelled/edited).
          const fresh = await this.readRecord(item.id)
          if (fresh) this.items.set(fresh.id, fresh)
          else this.items.delete(item.id)
          continue
        }
        this.items.set(claimed.id, claimed)
        this.emitFired(claimed.status === 'fired' ? claimed : { ...claimed, status: 'fired' })
      }
    } finally {
      this.running = false
      this.arm()
    }
  }

  private emitFired(item: ScheduleItem): void {
    for (const handler of [...this.handlers]) {
      try {
        handler(item)
      } catch {
        /* a presentation handler must not break the loop */
      }
    }
  }

  /** Atomically transitions a pending record; returns null when already claimed. */
  private async claim(
    id: string,
    expectedFireAt: number,
    now: number,
    next: number | null,
    missed: boolean,
  ): Promise<ScheduleItem | null> {
    const { store, done } = await getStore(STORE, 'readwrite')
    const record = (await reqAsPromise(store.get(id))) as ScheduleRecord | undefined
    if (!record || record.item.status !== 'pending' || record.item.fireAt !== expectedFireAt) {
      await done
      return null
    }
    const base = record.item
    const stored: ScheduleItem =
      next !== null
        ? { ...base, fireAt: next, status: 'pending', missed, lastFiredAt: now, updatedAt: now }
        : { ...base, status: 'fired', missed, lastFiredAt: now, updatedAt: now }
    store.put({ pk: id, item: stored } satisfies ScheduleRecord)
    await done
    return stored
  }

  private async persist(item: ScheduleItem): Promise<void> {
    const { store, done } = await getStore(STORE, 'readwrite')
    store.put({ pk: item.id, item } satisfies ScheduleRecord)
    await done
  }

  private async deleteRecord(id: string): Promise<void> {
    const { store, done } = await getStore(STORE, 'readwrite')
    store.delete(id)
    await done
  }

  private async readRecord(id: string): Promise<ScheduleItem | null> {
    const { store, done } = await getStore(STORE)
    const record = (await reqAsPromise(store.get(id))) as ScheduleRecord | undefined
    await done
    return record?.item ?? null
  }

  private async readAll(): Promise<ScheduleItem[]> {
    const { store, done } = await getStore(STORE)
    const records = (await reqAsPromise(store.getAll())) as ScheduleRecord[]
    await done
    return records.map((record) => record.item)
  }

  private arm(): void {
    if (this.fireTimer !== null) {
      window.clearTimeout(this.fireTimer)
      this.fireTimer = null
    }
    if (!this.started) return
    let earliest = Infinity
    for (const item of this.items.values()) {
      if (item.status === 'pending' && item.fireAt < earliest) earliest = item.fireAt
    }
    if (!Number.isFinite(earliest)) return
    const delay = Math.max(0, Math.min(earliest - Date.now(), MAX_TIMEOUT_MS))
    this.fireTimer = window.setTimeout(() => void this.checkDue(), delay)
  }
}

export const scheduler = new Scheduler()
