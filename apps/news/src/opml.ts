export interface OpmlFeed {
  title: string
  url: string
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function parseOpml(xml: string): OpmlFeed[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid OPML file')
  const outlines = Array.from(doc.getElementsByTagNameNS('*', 'outline'))
  const feeds: OpmlFeed[] = []
  const seen = new Set<string>()
  for (const outline of outlines) {
    const url = (outline.getAttribute('xmlUrl') ?? '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title = (outline.getAttribute('title') ?? outline.getAttribute('text') ?? url).trim() || url
    feeds.push({ title, url })
  }
  return feeds
}

export function buildOpml(feeds: OpmlFeed[], title = 'GFCode News'): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    '  </head>',
    '  <body>',
  ]
  for (const feed of feeds) {
    lines.push(
      `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}" />`,
    )
  }
  lines.push('  </body>', '</opml>')
  return `${lines.join('\n')}\n`
}
