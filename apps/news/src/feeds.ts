import type { GFCacheApi } from '../../../src/core/cache'
import { resolveUrl, stripHtml } from './html'

export const RSS2JSON_TEMPLATE = 'https://api.rss2json.com/v1/api.json?rss_url={url}'

/**
 * rss2json is the default: unlike raw CORS proxies it reliably sends
 * `Access-Control-Allow-Origin` and pre-parses the feed. It has a free-tier
 * rate limit, so a raw proxy can be selected in Settings.
 */
export const DEFAULT_PROXY_TEMPLATE = RSS2JSON_TEMPLATE

export interface ProxyPreset {
  id: string
  label: string
  template: string
}

/** Public feed proxies. Raw ones return the feed body; rss2json returns JSON. */
export const PROXY_PRESETS: ProxyPreset[] = [
  { id: 'rss2json', label: 'rss2json.com', template: RSS2JSON_TEMPLATE },
  { id: 'allorigins', label: 'allorigins.win (raw)', template: 'https://api.allorigins.win/raw?url={url}' },
  { id: 'allorigins-json', label: 'allorigins.win (json)', template: 'https://api.allorigins.win/get?url={url}' },
  { id: 'codetabs', label: 'codetabs.com', template: 'https://api.codetabs.com/v1/proxy?quest={url}' },
  { id: 'corsproxy', label: 'corsproxy.io', template: 'https://corsproxy.io/?url={url}' },
]

export interface FeedItem {
  id: string
  title: string
  link: string
  date: number
  excerpt: string
  content: string
  author: string
  image: string
}

export interface ParsedFeed {
  title: string
  siteUrl: string
  description: string
  items: FeedItem[]
}

export interface FeedSource {
  id: string
  url: string
}

export interface FetchOptions {
  force?: boolean
  signal?: AbortSignal
}

const FEED_TTL_MS = 15 * 60_000
const FEED_STALE_MS = 24 * 60 * 60_000
const FEED_TIMEOUT_MS = 20_000

/** Aborts a request after `ms`, also honouring an optional caller signal. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  timeout.addEventListener('abort', abort, { once: true })
  return controller.signal
}

export function buildProxyUrl(template: string, feedUrl: string): string {
  const encoded = encodeURIComponent(feedUrl)
  return template.includes('{url}') ? template.replace('{url}', encoded) : `${template}${encoded}`
}

/** Compact stable key so read-state maps stay small. */
export function hashKey(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0
  return (hash >>> 0).toString(36)
}

function localName(element: Element): string {
  return (element.localName || element.nodeName).toLowerCase()
}

function directChildren(element: Element, name: string): Element[] {
  const result: Element[] = []
  for (const child of Array.from(element.children)) {
    if (localName(child) === name) result.push(child)
  }
  return result
}

function firstChild(element: Element, name: string): Element | undefined {
  return directChildren(element, name)[0]
}

function descendants(element: Element, name: string): Element[] {
  return Array.from(element.getElementsByTagNameNS('*', name))
}

function textOf(element: Element | undefined): string {
  return (element?.textContent ?? '').trim()
}

function innerXml(element: Element): string {
  let output = ''
  for (const node of Array.from(element.childNodes)) {
    output += new XMLSerializer().serializeToString(node)
  }
  return output
}

function parseDate(value: string): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function firstDate(element: Element, names: string[]): number {
  for (const name of names) {
    const child = firstChild(element, name)
    if (!child) continue
    const ms = parseDate(textOf(child))
    if (ms) return ms
  }
  return 0
}

function atomLink(element: Element, rel = 'alternate'): string {
  const links = directChildren(element, 'link').filter((link) => link.getAttribute('href'))
  const match = links.find((link) => (link.getAttribute('rel') ?? 'alternate') === rel)
  return (match ?? links[0])?.getAttribute('href') ?? ''
}

function rssLink(item: Element): string {
  const link = textOf(firstChild(item, 'link'))
  if (link) return link
  const guid = firstChild(item, 'guid')
  if (guid && guid.getAttribute('isPermaLink') !== 'false') {
    const value = textOf(guid)
    if (/^https?:/i.test(value)) return value
  }
  return ''
}

function rssContent(item: Element): string {
  const encoded = firstChild(item, 'encoded')
  if (encoded) return encoded.textContent ?? ''
  return firstChild(item, 'description')?.textContent ?? ''
}

function atomContent(entry: Element): string {
  const element = firstChild(entry, 'content') ?? firstChild(entry, 'summary')
  if (!element) return ''
  const type = (element.getAttribute('type') ?? '').toLowerCase()
  if (type === 'xhtml') return innerXml(element)
  return element.textContent ?? ''
}

function authorOf(item: Element, atom: boolean): string {
  if (atom) {
    const author = firstChild(item, 'author')
    return author ? textOf(firstChild(author, 'name') ?? author) : ''
  }
  return textOf(firstChild(item, 'author') ?? firstChild(item, 'creator'))
}

function imageOf(item: Element, content: string, base: string): string {
  const enclosure = firstChild(item, 'enclosure')
  const encUrl = enclosure?.getAttribute('url') ?? ''
  const encType = enclosure?.getAttribute('type') ?? ''
  if (encUrl && (encType.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(encUrl))) {
    return resolveUrl(encUrl, base)
  }
  for (const name of ['thumbnail', 'content']) {
    const media = firstChild(item, name)
    const url = media?.getAttribute('url') ?? ''
    const type = media?.getAttribute('type') ?? media?.getAttribute('medium') ?? ''
    if (url && (type.includes('image') || !type)) return resolveUrl(url, base)
  }
  const inline = content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
  return inline ? resolveUrl(inline, base) : ''
}

export function parseFeedXml(xml: string, source: FeedSource): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new Error('Unrecognized feed format')
  }
  const root = doc.documentElement
  const atom = localName(root) === 'feed'
  const channel = descendants(root, 'channel')[0] ?? root

  const title = textOf(descendants(root, 'title')[0])
  const siteUrl = resolveUrl(
    atom ? atomLink(root) : textOf(firstChild(channel, 'link')),
    source.url,
  )
  const description = textOf(
    atom ? firstChild(root, 'subtitle') : firstChild(channel, 'description'),
  )

  const nodes = atom ? descendants(root, 'entry') : descendants(root, 'item')
  const base = siteUrl || source.url
  const items: FeedItem[] = []
  const seen = new Set<string>()

  for (const node of nodes) {
    const rawId = atom ? textOf(firstChild(node, 'id')) : textOf(firstChild(node, 'guid'))
    const rawLink = atom ? atomLink(node) : rssLink(node)
    const link = resolveUrl(rawLink, base) || rawLink
    const itemTitle = textOf(firstChild(node, 'title')) || '(untitled)'
    const date = atom
      ? firstDate(node, ['published', 'updated'])
      : firstDate(node, ['pubDate', 'published', 'updated', 'date'])
    const content = atom ? atomContent(node) : rssContent(node)
    const guid = rawId || link || `${itemTitle}|${date}`
    const id = hashKey(guid)
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      title: itemTitle,
      link,
      date,
      excerpt: stripHtml(content).slice(0, 260),
      content,
      author: authorOf(node, atom),
      image: imageOf(node, content, base),
    })
  }

  return { title, siteUrl, description, items }
}

interface Rss2JsonItem {
  title?: string
  pubDate?: string
  link?: string
  guid?: string
  author?: string
  thumbnail?: string
  description?: string
  content?: string
  enclosure?: { link?: string; type?: string }
}

interface Rss2JsonFeed {
  status?: string
  message?: string
  feed?: { url?: string; title?: string; link?: string; description?: string }
  items?: Rss2JsonItem[]
}

/** Maps an rss2json.com response onto the shared feed model. */
function parseRss2Json(data: Rss2JsonFeed, source: FeedSource): ParsedFeed {
  if (data.status && data.status !== 'ok') {
    throw new Error(data.message || 'Feed could not be parsed')
  }
  const feed = data.feed ?? {}
  const siteUrl = resolveUrl(feed.link ?? '', source.url)
  const base = siteUrl || source.url
  const items: FeedItem[] = []
  const seen = new Set<string>()

  for (const entry of data.items ?? []) {
    const link = resolveUrl(entry.link ?? '', base) || (entry.link ?? '')
    const title = (entry.title ?? '').trim() || '(untitled)'
    const date = parseDate(entry.pubDate ?? '')
    const content = entry.content || entry.description || ''
    const guid = entry.guid || link || `${title}|${date}`
    const id = hashKey(guid)
    if (seen.has(id)) continue
    seen.add(id)
    const enclosureType = entry.enclosure?.type ?? ''
    const enclosureLink = entry.enclosure?.link ?? ''
    const image = entry.thumbnail
      ? resolveUrl(entry.thumbnail, base)
      : enclosureLink && (enclosureType.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(enclosureLink))
        ? resolveUrl(enclosureLink, base)
        : imageOfContent(content, base)
    items.push({
      id,
      title,
      link,
      date,
      excerpt: stripHtml(content).slice(0, 260),
      content,
      author: (entry.author ?? '').trim(),
      image,
    })
  }

  return { title: (feed.title ?? '').trim(), siteUrl, description: stripHtml(feed.description ?? ''), items }
}

function imageOfContent(content: string, base: string): string {
  const inline = content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
  return inline ? resolveUrl(inline, base) : ''
}

/** Dispatches the proxy body to the JSON (rss2json / allorigins) or XML parser. */
function parseProxyBody(body: string, source: FeedSource): ParsedFeed {
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as Rss2JsonFeed & { contents?: unknown }
      if (Array.isArray(json.items) || json.feed || json.status) return parseRss2Json(json, source)
      if (typeof json.contents === 'string') return parseFeedXml(json.contents, source)
    } catch (error) {
      if (error instanceof SyntaxError) {
        /* fall through to the XML parser */
      } else {
        throw error
      }
    }
  }
  return parseFeedXml(body, source)
}

export async function fetchFeed(
  cache: GFCacheApi,
  source: FeedSource,
  proxyTemplate: string,
  options: FetchOptions = {},
): Promise<ParsedFeed> {
  const url = buildProxyUrl(proxyTemplate, source.url)
  const key = `feed:${source.id}:${hashKey(proxyTemplate)}`
  const body = await cache.fetchText(key, url, {
    ttlMs: FEED_TTL_MS,
    staleTtlMs: FEED_STALE_MS,
    force: options.force,
    signal: withTimeout(options.signal, FEED_TIMEOUT_MS),
  })
  return parseProxyBody(body, source)
}
