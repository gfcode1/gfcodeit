import type { MediaSourceInit } from '../core/types'

/**
 * Boundary validation for values arriving over the bridge. Apps are untrusted
 * once installed, so every RPC param is checked for shape, type and size before
 * it reaches shell APIs.
 */

export class BridgeParamError extends Error {
  readonly code = 'E_PARAM'
  constructor(field: string, expected: string) {
    super(`Invalid bridge parameter "${field}": expected ${expected}`)
    this.name = 'BridgeParamError'
  }
}

export type Params = Record<string, unknown>

export function asRecord(value: unknown): Params {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BridgeParamError('params', 'an object')
  }
  return value as Params
}

export function reqString(params: Params, field: string, max = 4096): string {
  const value = params[field]
  if (typeof value !== 'string') throw new BridgeParamError(field, 'a string')
  if (value.length > max) throw new BridgeParamError(field, `a string ≤ ${max} chars`)
  return value
}

export function optString(params: Params, field: string, max = 4096): string | undefined {
  const value = params[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new BridgeParamError(field, 'a string')
  if (value.length > max) throw new BridgeParamError(field, `a string ≤ ${max} chars`)
  return value
}

export function reqNumber(params: Params, field: string): number {
  const value = params[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeParamError(field, 'a finite number')
  }
  return value
}

export function optNumber(params: Params, field: string): number | undefined {
  const value = params[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeParamError(field, 'a finite number')
  }
  return value
}

export function reqInt(params: Params, field: string): number {
  const value = reqNumber(params, field)
  if (!Number.isInteger(value)) throw new BridgeParamError(field, 'an integer')
  return value
}

export function reqBool(params: Params, field: string): boolean {
  const value = params[field]
  if (typeof value !== 'boolean') throw new BridgeParamError(field, 'a boolean')
  return value
}

export function optBool(params: Params, field: string): boolean | undefined {
  const value = params[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new BridgeParamError(field, 'a boolean')
  return value
}

const MEDIA_SCHEMES = new Set(['http:', 'https:', 'blob:', 'data:'])

function mediaUrl(params: Params, field: string): string {
  const raw = reqString(params, field, 8192)
  let parsed: URL
  try {
    parsed = new URL(raw, window.location.origin)
  } catch {
    throw new BridgeParamError(field, 'a valid URL')
  }
  if (!MEDIA_SCHEMES.has(parsed.protocol)) {
    throw new BridgeParamError(field, 'an http(s), blob or data URL')
  }
  return raw
}

export function parseMediaSource(value: unknown): MediaSourceInit {
  const params = asRecord(value)
  return {
    url: mediaUrl(params, 'url'),
    crossOrigin: optBool(params, 'crossOrigin'),
    loop: optBool(params, 'loop'),
    volume: optNumber(params, 'volume'),
    title: optString(params, 'title', 256),
    artist: optString(params, 'artist', 256),
    album: optString(params, 'album', 256),
    artwork: optString(params, 'artwork', 8192),
  }
}

export function parseMediaMetadata(value: unknown): Partial<MediaSourceInit> {
  const params = asRecord(value)
  const meta: Partial<MediaSourceInit> = {}
  const title = optString(params, 'title', 256)
  if (title !== undefined) meta.title = title
  const artist = optString(params, 'artist', 256)
  if (artist !== undefined) meta.artist = artist
  const album = optString(params, 'album', 256)
  if (album !== undefined) meta.album = album
  const artwork = optString(params, 'artwork', 8192)
  if (artwork !== undefined) meta.artwork = artwork
  return meta
}

export function parseThemeMode(value: unknown): 'light' | 'dark' | 'system' {
  const mode = reqString(asRecord(value), 'mode', 16)
  if (mode !== 'light' && mode !== 'dark' && mode !== 'system') {
    throw new BridgeParamError('mode', 'one of light, dark, system')
  }
  return mode
}
