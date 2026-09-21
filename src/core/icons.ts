let assetBase: string | null = null

export function setAssetBase(base: string): void {
  assetBase = base.endsWith('/') ? base : `${base}/`
}

function base(): string {
  return assetBase ?? '/'
}

export function assetUrl(path: string): string {
  const relative = path.replace(/^\//, '')
  return new URL(relative, new URL(base(), window.location.origin)).href
}

/** OpenMoji codepoint: one or more 2-6 digit hex groups joined by `-`. */
const HEXCODE = /^[0-9A-F]{2,6}(-[0-9A-F]{2,6})*$/

/** Transparent 1×1 SVG used when a codepoint is missing or malformed. */
const BLANK_ICON =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E'

export function normalizeHex(hexcode: string): string {
  return hexcode.trim().toUpperCase()
}

export function iconUrl(codepoint: string): string {
  const hex = normalizeHex(codepoint)
  if (!HEXCODE.test(hex)) return BLANK_ICON
  return assetUrl(`openmoji/black/svg/${hex}.svg`)
}

export function colorIconUrl(codepoint: string): string {
  const hex = normalizeHex(codepoint)
  if (!HEXCODE.test(hex)) return BLANK_ICON
  return assetUrl(`openmoji/color/svg/${hex}.svg`)
}

export function emojiToHex(emoji: string): string {
  return [...emoji]
    .map((char) => (char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'))
    .join('-')
}

export interface IconMeta {
  hexcode: string
  name: string
  group: string
  tags: string
  order: number
}

let iconIndex: IconMeta[] | null = null

export async function loadIconIndex(): Promise<IconMeta[]> {
  if (iconIndex) return iconIndex
  const response = await fetch(assetUrl('openmoji/icons.json'))
  if (!response.ok) return []
  iconIndex = (await response.json()) as IconMeta[]
  return iconIndex
}
