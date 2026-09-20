import './styles.css'
import type { GFApi } from '../../../src/core/sdk'

async function bootstrapRuntime(): Promise<GFApi> {
  const base = import.meta.env.BASE_URL
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${base}framework/v1/tokens.css`
  document.head.append(link)

  await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
  return window.GF_READY
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  const profile = await gf.profile.getCurrent()
  const visits = ((await gf.storage.get<number>('visits')) ?? 0) + 1
  await gf.storage.set('visits', visits)

  const header = document.createElement('gf-page-header')
  header.setAttribute('title', '__NAME__')
  header.setAttribute('subtitle', `Hello ${profile.name} · visits: ${visits}`)

  const button = document.createElement('gf-button')
  button.setAttribute('variant', 'primary')
  button.textContent = 'Say hello'
  button.addEventListener('click', () => gf.ui.toast('Hello from __NAME__!', { variant: 'ok' }))

  root.append(header, button)
}

void start()
