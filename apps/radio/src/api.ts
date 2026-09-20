import type { GFApi } from '../../../src/core/sdk'

/**
 * Public Radio Browser API. Server names come from `/json/servers`; the API is
 * open CORS (`access-control-allow-origin: *`) so it can be called directly
 * from the browser. We keep a couple of mirrors and rotate on network failure.
 */
const SERVERS = ['https://de1.api.radio-browser.info', 'https://all.api.radio-browser.info']

let serverIndex = 0

function baseUrl(): string {
  return SERVERS[serverIndex % SERVERS.length]!
}

export function rotateServer(): void {
  serverIndex += 1
}

const TAGS_TTL_MS = 24 * 60 * 60_000
const TAGS_STALE_MS = 7 * 24 * 60 * 60_000
const COUNTRIES_TTL_MS = 24 * 60 * 60_000
const COUNTRIES_STALE_MS = 7 * 24 * 60 * 60_000
const SEARCH_TTL_MS = 10 * 60_000
const SEARCH_STALE_MS = 24 * 60 * 60_000
const TOP_TTL_MS = 30 * 60_000
const TOP_STALE_MS = 6 * 60 * 60_000

export type StationOrder = 'clickcount' | 'votes' | 'name'

export interface Station {
  uuid: string
  name: string
  url: string
  urlResolved: string
  homepage: string
  favicon: string
  tags: string[]
  country: string
  countryCode: string
  language: string
  votes: number
  codec: string
  bitrate: number
  clickCount: number
  isHls: boolean
  isSecure: boolean
}

export interface Tag {
  name: string
  stationCount: number
}

export interface Country {
  name: string
  code: string
  stationCount: number
}

interface RawStation {
  stationuuid?: string
  name?: string
  url?: string
  url_resolved?: string
  homepage?: string
  favicon?: string
  tags?: string
  country?: string
  countrycode?: string
  language?: string
  votes?: number
  codec?: string
  bitrate?: number
  hls?: number
  clickcount?: number
}

interface RawTag {
  name?: string
  stationcount?: number
}

interface RawCountry {
  name?: string
  iso_3166_1?: string
  stationcount?: number
}

interface RawVote {
  ok?: boolean
  message?: string
}

function isM3u8(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url)
}

function toStation(raw: RawStation): Station | null {
  const uuid = raw.stationuuid?.trim()
  if (!uuid) return null
  const urlResolved = (raw.url_resolved ?? '').trim()
  const url = (raw.url ?? '').trim()
  const playable = urlResolved || url
  if (!playable) return null
  const isHls = raw.hls === 1 || isM3u8(urlResolved) || isM3u8(url)
  return {
    uuid,
    name: (raw.name ?? '').trim() || 'Unknown station',
    url,
    urlResolved: urlResolved || url,
    homepage: (raw.homepage ?? '').trim(),
    favicon: (raw.favicon ?? '').trim(),
    tags: (raw.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    country: (raw.country ?? '').trim(),
    countryCode: (raw.countrycode ?? '').trim(),
    language: (raw.language ?? '').trim(),
    votes: Number(raw.votes ?? 0) || 0,
    codec: (raw.codec ?? '').trim(),
    bitrate: Number(raw.bitrate ?? 0) || 0,
    clickCount: Number(raw.clickcount ?? 0) || 0,
    isHls,
    isSecure: /^https:\/\//i.test(playable),
  }
}

/**
 * Cached JSON GET that rotates Radio Browser mirrors on network failure. The
 * cache key is server-independent so a stale entry still serves offline.
 */
async function jsonGet<T>(
  gf: GFApi,
  key: string,
  path: string,
  options: { ttlMs: number; staleTtlMs: number; signal?: AbortSignal },
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < SERVERS.length; attempt += 1) {
    try {
      return await gf.cache.fetchJson<T>(key, `${baseUrl()}${path}`, {
        ttlMs: options.ttlMs,
        staleTtlMs: options.staleTtlMs,
        signal: options.signal,
      })
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error
      lastError = error
      rotateServer()
    }
  }
  throw lastError
}

export interface SearchParams {
  name?: string
  tag?: string
  country?: string
  order?: StationOrder
  limit?: number
  signal?: AbortSignal
}

/**
 * Search stations. HLS-only streams are dropped because the native `<audio>`
 * element cannot play them outside Safari, and broken stations are hidden.
 */
export async function fetchStations(gf: GFApi, params: SearchParams = {}): Promise<Station[]> {
  const order = params.order ?? 'clickcount'
  const query = new URLSearchParams()
  if (params.name) query.set('name', params.name)
  if (params.tag) query.set('tag', params.tag)
  if (params.country) query.set('countrycode', params.country)
  query.set('hidebroken', 'true')
  query.set('order', order)
  query.set('reverse', order === 'name' ? 'false' : 'true')
  query.set('limit', String(params.limit ?? 60))

  const isTop = !params.name && !params.tag && !params.country && order === 'clickcount'
  const raw = await jsonGet<RawStation[]>(gf, `stations:${query.toString()}`, `/json/stations/search?${query}`, {
    ttlMs: isTop ? TOP_TTL_MS : SEARCH_TTL_MS,
    staleTtlMs: isTop ? TOP_STALE_MS : SEARCH_STALE_MS,
    signal: params.signal,
  })
  return raw
    .map(toStation)
    .filter((station): station is Station => station !== null && !station.isHls)
    .filter((station) => station.isSecure || window.location.protocol !== 'https:')
}

export async function fetchTags(gf: GFApi, signal?: AbortSignal): Promise<Tag[]> {
  const raw = await jsonGet<RawTag[]>(
    gf,
    'tags',
    '/json/tags?order=stationcount&reverse=true&limit=200',
    { ttlMs: TAGS_TTL_MS, staleTtlMs: TAGS_STALE_MS, signal },
  )
  return raw
    .map((tag) => ({ name: (tag.name ?? '').trim(), stationCount: Number(tag.stationcount ?? 0) || 0 }))
    .filter((tag) => tag.name.length > 0)
}

export async function fetchCountries(gf: GFApi, signal?: AbortSignal): Promise<Country[]> {
  const raw = await jsonGet<RawCountry[]>(
    gf,
    'countries',
    '/json/countries?order=stationcount&reverse=true&limit=200',
    { ttlMs: COUNTRIES_TTL_MS, staleTtlMs: COUNTRIES_STALE_MS, signal },
  )
  return raw
    .map((country) => ({
      name: (country.name ?? '').trim(),
      code: (country.iso_3166_1 ?? '').trim(),
      stationCount: Number(country.stationcount ?? 0) || 0,
    }))
    .filter((country) => country.code.length > 0)
}

/**
 * Registers a "click" on the station, as requested by the Radio Browser
 * guidelines. Fire-and-forget: failures never affect playback.
 */
export function registerClick(uuid: string): void {
  void fetch(`${baseUrl()}/json/url/${encodeURIComponent(uuid)}`).catch(() => undefined)
}

export async function voteStation(uuid: string): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${baseUrl()}/json/vote/${encodeURIComponent(uuid)}`)
    if (!response.ok) return { ok: false, message: `HTTP ${response.status}` }
    const payload = (await response.json()) as RawVote
    return { ok: payload.ok !== false, message: payload.message ?? '' }
  } catch (error) {
    return { ok: false, message: (error as Error).message }
  }
}
