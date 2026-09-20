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

export function normalizeHex(hexcode: string): string {
  return hexcode.trim().toUpperCase()
}

export function iconUrl(codepoint: string): string {
  return assetUrl(`openmoji/black/svg/${normalizeHex(codepoint)}.svg`)
}

export function colorIconUrl(codepoint: string): string {
  return assetUrl(`openmoji/color/svg/${normalizeHex(codepoint)}.svg`)
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
