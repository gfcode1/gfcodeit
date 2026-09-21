import type { GFApi } from '../../../src/core/sdk'
import { DEFAULT_PROXY_TEMPLATE } from './feeds'
import type { OpmlFeed } from './opml'

export interface Subscription {
  id: string
  title: string
  url: string
  groupId?: string
  favorite: boolean
  enabled: boolean
  addedAt: number
}

export interface SavedArticle {
  id: string
  feedId: string
  feedTitle: string
  title: string
  link: string
  date: number
  excerpt: string
  savedAt: number
}

export interface Settings {
  proxyTemplate: string
  markReadOnOpen: boolean
}

export interface NewsData {
  subscriptions: Subscription[]
  read: Record<string, number>
  saved: SavedArticle[]
  settings: Settings
}

const SUBSCRIPTIONS_KEY = 'subscriptions'
const READ_KEY = 'read'
const SAVED_KEY = 'saved'
const SETTINGS_KEY = 'settings'

/** Upper bound on remembered read entries, oldest evicted first. */
const MAX_READ_ENTRIES = 4000

export function readKey(feedId: string, itemId: string): string {
  return `${feedId}:${itemId}`
}

export function normalizeUrl(url: string): string {
  return url.trim()
}

export interface NewsStore {
  readonly data: NewsData
  load(): Promise<NewsData>
  persist(): Promise<void>
  addSubscription(feed: { title: string; url: string; groupId?: string }): Promise<Subscription | null>
  removeSubscription(id: string): Promise<void>
  updateSubscription(id: string, patch: Partial<Subscription>): Promise<void>
  isSubscribed(url: string): boolean
  subscriptionByUrl(url: string): Subscription | undefined
  mergeSubscriptions(feeds: OpmlFeed[]): Promise<number>
  markRead(keys: string[]): Promise<void>
  markAllRead(keys: string[]): Promise<void>
  markUnread(keys: string[]): Promise<void>
  isRead(key: string): boolean
  saveArticle(article: Omit<SavedArticle, 'savedAt'>): Promise<void>
  removeSaved(id: string): Promise<void>
  isSaved(link: string): boolean
  setSettings(patch: Partial<Settings>): Promise<void>
}

export function createNewsStore(gf: GFApi): NewsStore {
  const data: NewsData = {
    subscriptions: [],
    read: {},
    saved: [],
    settings: { proxyTemplate: DEFAULT_PROXY_TEMPLATE, markReadOnOpen: true },
  }

  function pruneRead(): void {
    const entries = Object.entries(data.read)
    if (entries.length <= MAX_READ_ENTRIES) return
    entries.sort((a, b) => b[1] - a[1])
    data.read = Object.fromEntries(entries.slice(0, MAX_READ_ENTRIES))
  }

  async function load(): Promise<NewsData> {
    const [subscriptions, read, saved, settings] = await Promise.all([
      gf.storage.get<Subscription[]>(SUBSCRIPTIONS_KEY),
      gf.storage.get<Record<string, number>>(READ_KEY),
      gf.storage.get<SavedArticle[]>(SAVED_KEY),
      gf.storage.get<Settings>(SETTINGS_KEY),
    ])
    data.subscriptions = subscriptions ?? []
    data.read = read ?? {}
    data.saved = saved ?? []
    data.settings = {
      proxyTemplate: settings?.proxyTemplate?.trim() || DEFAULT_PROXY_TEMPLATE,
      markReadOnOpen: settings?.markReadOnOpen ?? true,
    }
    return data
  }

  async function persist(): Promise<void> {
    await Promise.all([
      gf.storage.set(SUBSCRIPTIONS_KEY, data.subscriptions),
      gf.storage.set(READ_KEY, data.read),
      gf.storage.set(SAVED_KEY, data.saved),
      gf.storage.set(SETTINGS_KEY, data.settings),
    ])
  }

  async function addSubscription(feed: { title: string; url: string; groupId?: string }): Promise<Subscription | null> {
    const url = normalizeUrl(feed.url)
    if (!url || !/^https?:/i.test(url)) return null
    const existing = data.subscriptions.find((sub) => sub.url === url)
    if (existing) return existing
    const subscription: Subscription = {
      id: crypto.randomUUID(),
      title: feed.title.trim() || url,
      url,
      groupId: feed.groupId,
      favorite: false,
      enabled: true,
      addedAt: Date.now(),
    }
    data.subscriptions = [subscription, ...data.subscriptions]
    await persist()
    return subscription
  }

  async function removeSubscription(id: string): Promise<void> {
    data.subscriptions = data.subscriptions.filter((sub) => sub.id !== id)
    await persist()
  }

  async function updateSubscription(id: string, patch: Partial<Subscription>): Promise<void> {
    data.subscriptions = data.subscriptions.map((sub) =>
      sub.id === id ? { ...sub, ...patch, id: sub.id, url: sub.url } : sub,
    )
    await persist()
  }

  function isSubscribed(url: string): boolean {
    const target = normalizeUrl(url)
    return data.subscriptions.some((sub) => sub.url === target)
  }

  function subscriptionByUrl(url: string): Subscription | undefined {
    const target = normalizeUrl(url)
    return data.subscriptions.find((sub) => sub.url === target)
  }

  async function mergeSubscriptions(feeds: OpmlFeed[]): Promise<number> {
    const known = new Set(data.subscriptions.map((sub) => sub.url))
    let added = 0
    for (const feed of feeds) {
      const url = normalizeUrl(feed.url)
      if (!url || known.has(url) || !/^https?:/i.test(url)) continue
      known.add(url)
      data.subscriptions.push({
        id: crypto.randomUUID(),
        title: feed.title.trim() || url,
        url,
        favorite: false,
        enabled: true,
        addedAt: Date.now(),
      })
      added += 1
    }
    if (added > 0) await persist()
    return added
  }

  async function markRead(keys: string[]): Promise<void> {
    const now = Date.now()
    for (const key of keys) data.read[key] = now
    pruneRead()
    await gf.storage.set(READ_KEY, data.read)
  }

  async function markUnread(keys: string[]): Promise<void> {
    for (const key of keys) delete data.read[key]
    await gf.storage.set(READ_KEY, data.read)
  }

  function isRead(key: string): boolean {
    return key in data.read
  }

  async function saveArticle(article: Omit<SavedArticle, 'savedAt'>): Promise<void> {
    if (data.saved.some((entry) => entry.link && entry.link === article.link)) return
    data.saved = [{ ...article, savedAt: Date.now() }, ...data.saved]
    await persist()
  }

  async function removeSaved(id: string): Promise<void> {
    data.saved = data.saved.filter((entry) => entry.id !== id)
    await persist()
  }

  function isSaved(link: string): boolean {
    return Boolean(link) && data.saved.some((entry) => entry.link === link)
  }

  async function setSettings(patch: Partial<Settings>): Promise<void> {
    data.settings = { ...data.settings, ...patch }
    await persist()
  }

  return {
    data,
    load,
    persist,
    addSubscription,
    removeSubscription,
    updateSubscription,
    isSubscribed,
    subscriptionByUrl,
    mergeSubscriptions,
    markRead,
    markAllRead: markRead,
    markUnread,
    isRead,
    saveArticle,
    removeSaved,
    isSaved,
    setSettings,
  }
}
