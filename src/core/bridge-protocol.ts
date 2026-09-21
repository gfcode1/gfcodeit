import type { AppManifest, BridgeMethod, Profile, ThemeMode } from './types'

export const BRIDGE_PROTOCOL_VERSION = 1

/** Framework SDK version advertised to apps and matched against manifest `sdk`. */
export const FRAMEWORK_SDK_VERSION = '1.0.0'

function parseVersion(value: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = value
    .replace(/^[^\d]*/, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0)
  return [major, minor, patch]
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number)
  }
  return 0
}

/** Minimal semver range check supporting `^`, `~`, `<`, `<=`, `>`, `>=` and exact. */
export function rangeSatisfies(version: string, range: string): boolean {
  const current = parseVersion(version)
  const value = range.trim()
  if (value.startsWith('^')) {
    const base = parseVersion(value.slice(1))
    return compare(current, base) >= 0 && current[0] === base[0]
  }
  if (value.startsWith('~')) {
    const base = parseVersion(value.slice(1))
    return compare(current, base) >= 0 && current[0] === base[0] && current[1] === base[1]
  }
  const match = /^(>=|<=|>|<|=)?\s*(.*)$/.exec(value)
  const op = match?.[1] ?? '='
  const base = parseVersion(match?.[2] ?? '0.0.0')
  const diff = compare(current, base)
  switch (op) {
    case '>=':
      return diff >= 0
    case '<=':
      return diff <= 0
    case '>':
      return diff > 0
    case '<':
      return diff < 0
    default:
      return diff === 0
  }
}

export interface HelloMessage {
  t: 'gf:hello'
  v: number
  appId: string
  sdk: string
  manifest: AppManifest
  token: string
}

export interface WelcomeMessage {
  t: 'gf:welcome'
  v: number
  /** Per-open secret echoed back so the client can prove the shell saw its hello. */
  token: string
  theme: { mode: ThemeMode; accent: string; resolved: 'light' | 'dark' }
  profile: Pick<Profile, 'id' | 'name' | 'avatar' | 'accent'>
}

export interface RejectMessage {
  t: 'gf:reject'
  code: string
  message: string
}

export interface RpcRequest {
  k: 'rpc'
  id: number
  method: BridgeMethod
  params: unknown
}

export interface RpcResult {
  k: 'rpc:result'
  id: number
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

export interface EventMessage {
  k: 'ev'
  channel: string
  payload: unknown
}

export type BridgeMessage = RpcRequest | RpcResult | EventMessage

export interface RpcError {
  code: string
  message: string
}

export const RPC_TIMEOUT_MS = 10_000

export class BridgeError extends Error {
  readonly code: string
  constructor(error: RpcError) {
    super(error.message)
    this.name = 'BridgeError'
    this.code = error.code
  }
}
