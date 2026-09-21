import type { GFApi } from '../../../../src/core/sdk'

export const STORAGE_KEY = 'data'

export interface ArcadeData {
  best: Record<string, number>
  settings: { muted: boolean }
  plays: number
}

export function defaultData(): ArcadeData {
  return { best: {}, settings: { muted: false }, plays: 0 }
}

export function normalizeData(input: unknown): ArcadeData {
  const base = defaultData()
  if (!input || typeof input !== 'object') return base
  const source = input as Partial<ArcadeData>

  if (source.best && typeof source.best === 'object') {
    for (const [key, value] of Object.entries(source.best)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        base.best[key] = Math.floor(value)
      }
    }
  }

  if (source.settings && typeof source.settings === 'object') {
    base.settings.muted = source.settings.muted === true
  }

  if (typeof source.plays === 'number' && Number.isFinite(source.plays) && source.plays >= 0) {
    base.plays = Math.floor(source.plays)
  }

  return base
}

export async function loadData(gf: GFApi): Promise<ArcadeData> {
  return normalizeData(await gf.storage.get<unknown>(STORAGE_KEY))
}

export async function saveData(gf: GFApi, data: ArcadeData): Promise<void> {
  await gf.storage.set(STORAGE_KEY, data)
}
