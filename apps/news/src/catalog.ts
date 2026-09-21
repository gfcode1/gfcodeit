import type { GFCacheApi } from '../../../src/core/cache'

export interface CatalogFeed {
  title: string
  url: string
  description?: string
}

export interface CatalogGroup {
  id: string
  title: string
  kind: 'category' | 'country'
  feeds: CatalogFeed[]
}

export interface Catalog {
  source: string
  generatedAt: string
  groups: CatalogGroup[]
}

const CATALOG_TTL_MS = 7 * 24 * 60 * 60_000
const CATALOG_STALE_MS = 30 * 24 * 60 * 60_000

function emptyCatalog(): Catalog {
  return { source: '', generatedAt: '', groups: [] }
}

export async function loadCatalog(cache: GFCacheApi, force = false): Promise<Catalog> {
  const url = `${import.meta.env.BASE_URL}rss-catalog.json`
  try {
    const data = await cache.fetchJson<Catalog>('rss-catalog', url, {
      ttlMs: CATALOG_TTL_MS,
      staleTtlMs: CATALOG_STALE_MS,
      force,
    })
    if (!data || !Array.isArray(data.groups)) return emptyCatalog()
    return data
  } catch {
    return emptyCatalog()
  }
}
