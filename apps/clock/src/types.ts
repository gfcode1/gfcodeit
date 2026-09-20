import type { GFApi } from '../../../src/core/sdk'
import type { ScheduleItem } from '../../../src/core/types'
import type { ToastOptions } from '../../../src/ui/overlay'

export type Tab = 'clock' | 'timer' | 'alarm' | 'stopwatch'

export interface Prefs {
  hour12: boolean
  showSeconds: boolean
  tab: Tab
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export interface TimerState {
  status: TimerStatus
  durationMs: number
  /** Epoch when a running timer ends. */
  endAt: number
  /** Remaining time while idle/paused/done. */
  remainingMs: number
  label: string
  schedulerId?: string
}

export type AlarmRepeat = 'daily' | 'once'

export interface Alarm {
  id: string
  /** 'HH:MM' 24h. */
  time: string
  label: string
  repeat: AlarmRepeat
  enabled: boolean
  schedulerId?: string
  lastFiredAt?: number
}

export interface StopwatchState {
  running: boolean
  /** Epoch of the last start (valid while running). */
  startedAt: number
  /** Elapsed time banked while paused. */
  accumulatedMs: number
  /** Elapsed totals captured at each lap. */
  laps: number[]
}

export interface PanelContext {
  gf: GFApi
  prefs: Prefs
  savePrefs(patch: Partial<Prefs>): Promise<void>
  toast(message: string, options?: ToastOptions): void
}

export interface Panel {
  readonly el: HTMLElement
  activate(): void
  deactivate(): void
  reload(): void
  onSchedulerFired?(item: ScheduleItem): void
}
