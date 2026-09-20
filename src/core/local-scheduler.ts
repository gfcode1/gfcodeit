import { bus } from './bus'
import { DEFAULT_SNOOZE_MS, nextOccurrence, normalizeDraft } from './schedule-time'
import type { ScheduleDraft, ScheduleItem } from './types'

/**
 * Best-effort scheduler for apps running standalone (opened as their own page,
 * not embedded in the shell). In-memory only: entries survive navigation within
 * the page but not a reload, and no system notification is shown. Apps should
 * prefer the shell-hosted scheduler, which persists and fires while backgrounded.
 */

const MAX_TIMEOUT_MS = 2 ** 31 - 1
const MISSED_GRACE_MS = 60_000

export interface LocalScheduler {
  schedule(draft: ScheduleDraft): Promise<ScheduleItem>
  cancel(id: string): Promise<boolean>
  snooze(id: string, ms?: number): Promise<boolean>
  list(): Promise<ScheduleItem[]>
  clear(): Promise<void>
  onFired(handler: (item: ScheduleItem) => void): () => void
}

export function createLocalScheduler(appId: string, getProfileId: () => string): LocalScheduler {
  const items = new Map<string, ScheduleItem>()
  let timer: number | null = null

  function arm(): void {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    let earliest = Infinity
    for (const item of items.values()) {
      if (item.status === 'pending' && item.fireAt < earliest) earliest = item.fireAt
    }
    if (!Number.isFinite(earliest)) return
    timer = window.setTimeout(fire, Math.max(0, Math.min(earliest - Date.now(), MAX_TIMEOUT_MS)))
  }

  function fire(): void {
    timer = null
    const now = Date.now()
    for (const item of [...items.values()]) {
      if (item.status !== 'pending' || item.fireAt > now) continue
      const next = item.repeat ? nextOccurrence(item.fireAt, item.repeat, now) : null
      const missed = now - item.fireAt > MISSED_GRACE_MS
      const fired: ScheduleItem = { ...item, status: 'fired', missed, lastFiredAt: now, updatedAt: now }
      items.set(item.id, next !== null ? { ...item, fireAt: next, missed, lastFiredAt: now, updatedAt: now } : fired)
      bus.emit('scheduler:fired', fired)
    }
    arm()
  }

  return {
    async schedule(draft) {
      const now = Date.now()
      const item: ScheduleItem = {
        ...normalizeDraft(draft, now),
        id: crypto.randomUUID(),
        appId,
        profileId: getProfileId(),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }
      items.set(item.id, item)
      arm()
      return item
    },
    async cancel(id) {
      if (!items.has(id)) return false
      items.delete(id)
      arm()
      return true
    },
    async snooze(id, ms) {
      const item = items.get(id)
      if (!item) return false
      const now = Date.now()
      items.set(id, {
        ...item,
        fireAt: now + Math.max(0, ms ?? item.snoozeMs ?? DEFAULT_SNOOZE_MS),
        status: 'pending',
        missed: false,
        updatedAt: now,
      })
      arm()
      return true
    },
    async list() {
      return [...items.values()].sort((a, b) => a.fireAt - b.fireAt)
    },
    async clear() {
      items.clear()
      arm()
    },
    onFired(handler) {
      return bus.on('scheduler:fired', handler)
    },
  }
}
