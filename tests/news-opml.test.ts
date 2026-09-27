import { describe, expect, it } from 'vitest'
import { buildOpml, parseOpml } from '../apps/news/src/opml'

const SAMPLE = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline type="rss" text="Feed A" title="Feed A" xmlUrl="https://a.test/rss" />
      <outline type="rss" title="Feed B" xmlUrl="https://b.test/rss" />
      <outline type="rss" text="Duplicate" xmlUrl="https://a.test/rss" />
      <outline type="rss" text="No url" />
    </outline>
  </body>
</opml>`

describe('parseOpml', () => {
  it('extracts unique feeds and skips entries without a url', () => {
    const feeds = parseOpml(SAMPLE)
    expect(feeds).toEqual([
      { title: 'Feed A', url: 'https://a.test/rss' },
      { title: 'Feed B', url: 'https://b.test/rss' },
    ])
  })

  it('falls back to the url when no title/text is present', () => {
    const feeds = parseOpml('<opml><body><outline xmlUrl="https://c.test/rss" /></body></opml>')
    expect(feeds[0]).toEqual({ title: 'https://c.test/rss', url: 'https://c.test/rss' })
  })

  it('throws on invalid XML', () => {
    expect(() => parseOpml('<opml><body>')).toThrow(/Invalid OPML/)
  })
})

describe('buildOpml', () => {
  it('escapes XML special characters', () => {
    const xml = buildOpml([{ title: 'A & B <c>', url: 'https://x.test/rss?a=1&b=2' }])
    expect(xml).toContain('A &amp; B &lt;c&gt;')
    expect(xml).toContain('https://x.test/rss?a=1&amp;b=2')
  })

  it('round-trips through parseOpml', () => {
    const feeds = [
      { title: 'One', url: 'https://one.test/rss' },
      { title: 'Two', url: 'https://two.test/rss' },
    ]
    expect(parseOpml(buildOpml(feeds))).toEqual(feeds)
  })
})
