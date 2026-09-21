/** Strips every tag from a fragment of feed HTML and decodes entities. */
export function stripHtml(value: string): string {
  if (!value) return ''
  const doc = new DOMParser().parseFromString(value, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Resolves a possibly relative URL against a base, allowing only http(s). */
export function resolveUrl(value: string, base: string): string {
  const raw = value.trim()
  if (!raw) return ''
  try {
    const url = new URL(raw, base || undefined)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    return ''
  } catch {
    return ''
  }
}

const ALLOWED = new Set([
  'p', 'br', 'hr', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'em', 'strong', 'b', 'i', 'u', 's', 'sub', 'sup', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'div', 'span', 'time', 'abbr',
])

/** Tags whose whole subtree is dropped (never unwrapped). */
const DROPPED = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'link', 'meta', 'base', 'svg', 'math', 'template',
  'noscript', 'audio', 'video', 'canvas',
])

function safeSrc(value: string, base: string): string {
  const raw = value.trim()
  if (/^data:image\//i.test(raw)) return raw
  return resolveUrl(raw, base)
}

function appendSanitized(node: Node, base: string, parent: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parent.appendChild(document.createTextNode(node.nodeValue ?? ''))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return

  const el = node as Element
  const tag = (el.localName || el.nodeName).toLowerCase()
  if (DROPPED.has(tag)) return

  if (!ALLOWED.has(tag)) {
    for (const child of Array.from(el.childNodes)) appendSanitized(child, base, parent)
    return
  }

  const clean = document.createElement(tag)
  if (tag === 'a') {
    const href = resolveUrl(el.getAttribute('href') ?? '', base)
    if (href) clean.setAttribute('href', href)
    clean.setAttribute('target', '_blank')
    clean.setAttribute('rel', 'noopener noreferrer')
  } else if (tag === 'img') {
    const src = safeSrc(el.getAttribute('src') ?? '', base)
    if (src) clean.setAttribute('src', src)
    const alt = el.getAttribute('alt')
    if (alt) clean.setAttribute('alt', alt)
    clean.setAttribute('loading', 'lazy')
  }
  for (const child of Array.from(el.childNodes)) appendSanitized(child, base, clean)
  parent.appendChild(clean)
}

/**
 * Renders untrusted feed HTML into `target` using a strict allowlist.
 * Scripts, styles, event handlers and unsafe URLs are removed.
 */
export function renderRich(target: HTMLElement, html: string, base: string): void {
  target.textContent = ''
  if (!html) return
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const fragment = document.createDocumentFragment()
  for (const child of Array.from(doc.body.childNodes)) appendSanitized(child, base, fragment)
  target.appendChild(fragment)
}
