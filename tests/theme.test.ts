import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveTheme } from '../src/core/theme'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
})

describe('resolveTheme', () => {
  it('returns explicit modes unchanged', () => {
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the system preference', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(resolveTheme('system')).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets the resolved theme on the root element', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies the accent and a readable ink colour', () => {
    applyTheme('light', '#000000')
    expect(document.documentElement.style.getPropertyValue('--gf-accent')).toBe('#000000')
    expect(document.documentElement.style.getPropertyValue('--gf-accent-ink')).toBe('#ffffff')

    applyTheme('light', '#ffffff')
    expect(document.documentElement.style.getPropertyValue('--gf-accent-ink')).toBe('#111111')
  })
})
