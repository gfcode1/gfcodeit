import type { GFCacheApi } from '../../../src/core/cache'

const API_BASE = 'https://somafm.com'

const CHANNELS_TTL_MS = 12 * 60 * 60_000
const CHANNELS_STALE_MS = 7 * 24 * 60 * 60_000
// Now-playing changes constantly and is polled every 15 s; keep it in memory only.
const SONGS_TTL_MS = 20_000
const SONGS_STALE_MS = 2 * 60_000
const PLAYLIST_TTL_MS = 24 * 60 * 60_000
const PLAYLIST_STALE_MS = 30 * 24 * 60 * 60_000

export type StreamFormat = 'mp3' | 'aac' | 'aacp'
export type QualityPref = 'best' | 'balanced' | 'saver'

export interface StreamVariant {
  format: StreamFormat
  quality: string
  bitrate: number
  playlistUrl: string
}

export interface Channel {
  id: string
  title: string
  description: string
  dj: string
  genre: string[]
  image: string
  largeImage: string
  xlImage: string
  listeners: number
  lastPlaying: string
  streams: StreamVariant[]
}

export interface Song {
  title: string
  artist: string
  album: string
  albumArt: string
  date: number
}

interface RawPlaylist {
  url?: string
  format?: string
  quality?: string
}

interface RawChannel {
  id?: string
  title?: string
  description?: string
  dj?: string
  genre?: string
  image?: string
  largeimage?: string
  xlimage?: string
  listeners?: string
  lastPlaying?: string
  playlists?: RawPlaylist[]
}

interface RawSong {
  title?: string
  artist?: string
  album?: string
  albumArt?: string
  date?: string
}

const DEFAULT_BITRATE: Record<StreamFormat, number> = { mp3: 128, aac: 128, aacp: 64 }

function normalizeFormat(value: string | undefined): StreamFormat {
  if (value === 'aacp') return 'aacp'
  if (value === 'aac') return 'aac'
  return 'mp3'
}

function bitrateFromUrl(url: string, format: StreamFormat): number {
  const match = /(\d{2,3})\.pls$/i.exec(url)
  if (match) return Number(match[1])
  return DEFAULT_BITRATE[format]
}

function toChannel(raw: RawChannel): Channel | null {
  if (!raw.id || !raw.title) return null
  const streams: StreamVariant[] = []
  for (const playlist of raw.playlists ?? []) {
    if (!playlist.url) continue
    const format = normalizeFormat(playlist.format)
    streams.push({
      format,
      quality: playlist.quality ?? '',
      bitrate: bitrateFromUrl(playlist.url, format),
      playlistUrl: playlist.url,
    })
  }
  const image = raw.image ?? ''
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    dj: raw.dj ?? '',
    genre: (raw.genre ?? '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean),
    image,
    largeImage: raw.largeimage ?? image,
    xlImage: raw.xlimage ?? raw.largeimage ?? image,
    listeners: Number(raw.listeners ?? 0) || 0,
    lastPlaying: raw.lastPlaying ?? '',
    streams,
  }
}

export async function fetchChannels(cache: GFCacheApi, signal?: AbortSignal): Promise<Channel[]> {
  const payload = await cache.fetchJson<{ channels?: RawChannel[] }>(
    'channels',
    `${API_BASE}/channels.json`,
    { ttlMs: CHANNELS_TTL_MS, staleTtlMs: CHANNELS_STALE_MS, signal },
  )
  return (payload.channels ?? [])
    .map(toChannel)
    .filter((channel): channel is Channel => channel !== null && channel.streams.length > 0)
}

export async function fetchSongs(
  cache: GFCacheApi,
  channelId: string,
  signal?: AbortSignal,
): Promise<Song[]> {
  try {
    const payload = await cache.fetchJson<{ songs?: RawSong[] }>(
      `songs:${channelId}`,
      `${API_BASE}/songs/${encodeURIComponent(channelId)}.json`,
      { ttlMs: SONGS_TTL_MS, staleTtlMs: SONGS_STALE_MS, persist: false, signal },
    )
    return (payload.songs ?? []).map((song) => ({
      title: song.title ?? '',
      artist: song.artist ?? '',
      album: song.album ?? '',
      albumArt: song.albumArt ?? '',
      date: Number(song.date ?? 0) || 0,
    }))
  } catch (error) {
    // `status` comes from the framework's HttpError; duck-typed so it survives the bundle boundary.
    if ((error as { status?: number } | null)?.status === 404) return []
    throw error
  }
}

export async function resolveStreamUrls(
  cache: GFCacheApi,
  playlistUrl: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const text = await cache.fetchText(playlistUrl, playlistUrl, {
    ttlMs: PLAYLIST_TTL_MS,
    staleTtlMs: PLAYLIST_STALE_MS,
    signal,
  })
  const urls: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^File\d+\s*=\s*(.+)$/i.exec(line.trim())
    if (!match) continue
    const url = match[1].trim()
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url)
  }
  if (urls.length === 0) throw new Error('Playlist empty')
  return urls
}

function qualityScore(stream: StreamVariant): number {
  const bonus = stream.format === 'mp3' ? 1 : stream.format === 'aac' ? 0.5 : 0
  return stream.bitrate + bonus
}

export function selectStream(channel: Channel, pref: QualityPref): StreamVariant | null {
  const streams = [...channel.streams]
  if (streams.length === 0) return null
  streams.sort((a, b) => qualityScore(b) - qualityScore(a))
  if (pref === 'best') return streams[0]!
  if (pref === 'saver') return streams[streams.length - 1]!
  const target = 128
  return streams.reduce((best, stream) =>
    Math.abs(qualityScore(stream) - target) < Math.abs(qualityScore(best) - target) ? stream : best,
  )
}

export function formatStreamLabel(stream: StreamVariant): string {
  const name = stream.format === 'mp3' ? 'MP3' : stream.format === 'aac' ? 'AAC' : 'AAC+'
  return `${name} · ${stream.bitrate}k`
}
