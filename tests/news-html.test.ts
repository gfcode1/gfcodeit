import { describe, expect, it } from 'vitest'
import { renderRich, resolveUrl, stripHtml } from '../apps/news/src/html'

describe('stripHtml', () => {
  it('removes tags, decodes entities and collapses whitespace', () => {
    expect(stripHtml('<p>Hello &amp; <b>world</b></p>')).toBe('Hello & world')
    expect(stripHtml('  a\n\n  b  ')).toBe('a b')
    expect(stripHtml('')).toBe('')
  })
})

describe('resolveUrl', () => {
  it('resolves relative urls against the base', () => {
    expect(resolveUrl('/img.png', 'https://site.test/post')).toBe('https://site.test/img.png')
    expect(resolveUrl('img.png', 'https://site.test/post/')).toBe('https://site.test/post/img.png')
  })

  it('rejects non-http(s) protocols', () => {
    expect(resolveUrl('javascript:alert(1)', 'https://site.test')).toBe('')
    expect(resolveUrl('mailto:x@y.z', 'https://site.test')).toBe('')
    expect(resolveUrl('data:text/html,<script>', 'https://site.test')).toBe('')
    expect(resolveUrl('', 'https://site.test')).toBe('')
  })
})

describe('renderRich', () => {
  const base = 'https://site.test/post'

  function render(html: string): HTMLElement {
    const target = document.createElement('div')
    renderRich(target, html, base)
    return target
  }

  it('keeps allowlisted markup', () => {
    const out = render('<p>Hello <strong>world</strong></p>')
    expect(out.querySelector('p strong')?.textContent).toBe('world')
  })

  it('drops script/style/iframe subtrees entirely', () => {
    const out = render('<p>ok</p><script>alert(1)</script><iframe title="evil"></iframe><style>x{}</style>')
    expect(out.querySelector('script')).toBeNull()
    expect(out.querySelector('iframe')).toBeNull()
    expect(out.querySelector('style')).toBeNull()
    expect(out.textContent).toContain('ok')
  })

  it('strips event handlers and unknown attributes', () => {
    const out = render('<p onclick="alert(1)" style="color:red">text</p>')
    const p = out.querySelector('p')
    expect(p?.getAttribute('onclick')).toBeNull()
    expect(p?.getAttribute('style')).toBeNull()
  })

  it('unwraps unknown tags but keeps their text', () => {
    const out = render('<marquee>hello</marquee>')
    expect(out.querySelector('marquee')).toBeNull()
    expect(out.textContent).toBe('hello')
  })

  it('hardens links: safe href, target and rel', () => {
    const safe = render('<a href="/next">go</a>').querySelector('a')
    expect(safe?.getAttribute('href')).toBe('https://site.test/next')
    expect(safe?.getAttribute('target')).toBe('_blank')
    expect(safe?.getAttribute('rel')).toBe('noopener noreferrer')

    const unsafe = render('<a href="javascript:alert(1)">go</a>').querySelector('a')
    expect(unsafe?.getAttribute('href')).toBeNull()
  })

  it('allows data: images but blocks script urls and resolves relative ones', () => {
    const dataImg = render('<img src="data:image/png;base64,AAAA" alt="x">').querySelector('img')
    expect(dataImg?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(dataImg?.getAttribute('loading')).toBe('lazy')

    const relImg = render('<img src="pic.png">').querySelector('img')
    expect(relImg?.getAttribute('src')).toBe('https://site.test/pic.png')

    const evil = render('<img src="javascript:alert(1)">').querySelector('img')
    expect(evil?.getAttribute('src')).toBeNull()
  })
})
