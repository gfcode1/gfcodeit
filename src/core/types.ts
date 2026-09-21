export type StorageScope = 'profile' | 'shared'

export type Category =
  | 'productivity'
  | 'utilities'
  | 'media'
  | 'data'
  | 'tools'
  | 'games'
  | 'misc'

export type Permission =
  | 'storage'
  | 'profile'
  | 'navigation'
  | 'ui.toast'
  | 'ui.modal'
  | 'ui.confirm'
  | 'theme.write'
  | 'notifications'
  | 'scheduler'
  | 'media'

export interface AppStorageConfig {
  scope?: StorageScope
  schemaVersion?: number
}

export interface AppManifest {
  id: string
  name: string
  description?: string
  /** OpenMoji codepoint (hexcode), e.g. "1F4DD". */
  icon: string
  color?: string
  category?: Category
  version: string
  /** Semver range of the framework SDK the app requires, e.g. "^1.0.0". */
  sdk: string
  entry: string
  permissions?: Permission[]
  storage?: AppStorageConfig
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface RecentEntry {
  appId: string
  at: number
}

export interface Profile {
  id: string
  name: string
  /** OpenMoji codepoint. */
  avatar: string
  accent: string
  themeMode: ThemeMode
  isDefault: boolean
  createdAt: number
  lastUsedAt: number
  favorites: string[]
  recent: RecentEntry[]
}

/** What a scheduled entry represents. */
export type ScheduleKind = 'timer' | 'alarm' | 'reminder' | 'notification'

export type ScheduleStatus = 'pending' | 'fired' | 'dismissed' | 'snoozed' | 'cancelled'

export interface ScheduleRepeat {
  mode: 'daily' | 'weekly' | 'weekdays' | 'interval'
  /** `weekly`: 0-6 (Sunday-based). */
  days?: number[]
  /** `interval`: milliseconds between occurrences. */
  everyMs?: number
}

export interface ScheduleItem {
  id: string
  kind: ScheduleKind
  appId: string
  profileId: string
  title: string
  body?: string
  /** OpenMoji codepoint shown in the alarm overlay / notification. */
  icon?: string
  /** In-shell route opened when the user taps the entry, e.g. "#/app/calendar". */
  deepLink?: string
  /** Epoch ms at which the entry fires (recomputed on repeat/snooze). */
  fireAt: number
  repeat?: ScheduleRepeat | null
  /** Play the alarm sound when this entry fires. */
  sound?: boolean
  /** Default snooze duration offered in the alarm overlay. */
  snoozeMs?: number
  status: ScheduleStatus
  /** True when the entry fired late (tab was closed/suspended past its fireAt). */
  missed?: boolean
  createdAt: number
  updatedAt: number
  lastFiredAt?: number
}

/** Input accepted from apps; `delayMs` and `fireAt` are mutually exclusive. */
export interface ScheduleDraft {
  kind: ScheduleKind
  title: string
  body?: string
  icon?: string
  deepLink?: string
  delayMs?: number
  fireAt?: number
  repeat?: ScheduleRepeat | null
  sound?: boolean
  snoozeMs?: number
}

export type MediaStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

/** A media source requested by an app; playback is owned by the shell. */
export interface MediaSourceInit {
  url: string
  /** Request CORS for the stream (most radio streams must NOT set this). */
  crossOrigin?: boolean
  loop?: boolean
  /** Source volume 0..1, multiplied by the session master volume. */
  volume?: number
  title?: string
  artist?: string
  album?: string
  artwork?: string
}

export interface MediaSourceState {
  id: string
  status: MediaStatus
  volume: number
  loop: boolean
  crossOrigin: boolean
  error?: string
  title?: string
  artist?: string
  album?: string
  artwork?: string
}

/** Snapshot of the audio owned by one app. */
export interface MediaState {
  owner: string | null
  status: MediaStatus
  paused: boolean
  master: number
  sources: MediaSourceState[]
}

export type MediaAction = 'play' | 'pause' | 'stop' | 'next' | 'previous'

export interface MediaCommand {
  action: MediaAction
}

export type BridgeMethod =
  | 'shell.navigate'
  | 'shell.home'
  | 'ui.toast'
  | 'ui.modal'
  | 'ui.confirm'
  | 'ui.badge'
  | 'theme.get'
  | 'theme.set'
  | 'scheduler.schedule'
  | 'scheduler.cancel'
  | 'scheduler.snooze'
  | 'scheduler.list'
  | 'scheduler.clear'
  | 'media.play'
  | 'media.load'
  | 'media.pause'
  | 'media.resume'
  | 'media.remove'
  | 'media.clear'
  | 'media.setVolume'
  | 'media.setMasterVolume'
  | 'media.setPaused'
  | 'media.setMetadata'
  | 'media.list'
  | 'media.setSleepTimer'
