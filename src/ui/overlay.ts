import { GFElement, define } from './base'

export class GFModal extends GFElement {
  static readonly observedAttributes = ['open', 'title']

  protected override styles(): string {
    return `
      :host { display: contents; color: var(--gf-ink); }
      .backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.5);
        display: none; align-items: center; justify-content: center; padding: var(--gf-s4);
        z-index: 1000;
      }
      :host([open]) .backdrop { display: flex; }
      .panel {
        width: min(560px, 100%); max-height: 85vh; overflow: auto;
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-3);
      }
      header {
        display: flex; align-items: center; justify-content: space-between; gap: var(--gf-s3);
        padding: var(--gf-s3) var(--gf-s4); border-bottom: 2px solid var(--gf-ink);
      }
      header .title { font-family: var(--gf-font-mono); text-transform: uppercase; letter-spacing: .06em; font-size: var(--gf-fs-sm); }
      .close { width: 28px; height: 28px; border: 2px solid var(--gf-ink); background: var(--gf-surface); font-family: var(--gf-font-mono); }
      .close:hover { background: var(--gf-ink); color: var(--gf-paper); }
      .body { padding: var(--gf-s4); }
      footer { padding: var(--gf-s3) var(--gf-s4); border-top: 2px solid var(--gf-ink); display: flex; justify-content: flex-end; gap: var(--gf-s2); }
      footer:empty { display: none; }
    `
  }

  protected override template(): string {
    return `
      <div class="backdrop" part="backdrop">
        <div class="panel" role="dialog" aria-modal="true">
          <header>
            <span class="title"></span>
            <button class="close" type="button" aria-label="Close">&times;</button>
          </header>
          <div class="body"><slot></slot></div>
          <footer><slot name="footer"></slot></footer>
        </div>
      </div>
    `
  }

  protected override mounted(): void {
    this.query('.close')?.addEventListener('click', () => this.close())
    this.query('.backdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.close()
    })
    this.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.close()
    })
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const title = this.query('.title')
    if (title) title.textContent = this.getAttribute('title') ?? ''
  }

  open(): void {
    this.setAttribute('open', '')
    this.query<HTMLElement>('.close')?.focus()
  }

  close(): void {
    this.removeAttribute('open')
    this.emit('gf-close')
  }
}

export class GFMenu extends GFElement {
  static readonly observedAttributes = ['open']

  protected override styles(): string {
    return `
      :host { display: inline-block; position: relative; }
      .panel {
        position: absolute; right: 0; top: calc(100% + var(--gf-s1)); min-width: 200px;
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-2); padding: var(--gf-s1); z-index: 900;
        display: none;
      }
      :host([open]) .panel { display: block; }
      ::slotted([data-menu-item]) {
        display: block; width: 100%; text-align: left; padding: var(--gf-s2) var(--gf-s3);
        font-family: var(--gf-font-mono); font-size: var(--gf-fs-sm); text-transform: uppercase;
        letter-spacing: .04em; cursor: pointer; border: none; background: none; color: inherit;
      }
      ::slotted([data-menu-item]:hover) { background: var(--gf-ink); color: var(--gf-paper); }
    `
  }

  protected override template(): string {
    return `
      <span class="trigger" part="trigger"><slot name="trigger"></slot></span>
      <div class="panel" part="panel" role="menu"><slot name="panel"></slot></div>
    `
  }

  protected override mounted(): void {
    this.query('.trigger')?.addEventListener('click', (event) => {
      event.stopPropagation()
      this.toggleAttribute('open')
    })
    document.addEventListener('click', this.onDocumentClick)
    this.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-menu-item]')) this.removeAttribute('open')
    })
  }

  disconnectedCallback(): void {
    document.removeEventListener('click', this.onDocumentClick)
  }

  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!event.composedPath().includes(this)) this.removeAttribute('open')
  }
}

class GFToaster extends GFElement {
  protected override styles(): string {
    return `
      :host {
        position: fixed; left: 50%; bottom: var(--gf-s5); transform: translateX(-50%);
        display: flex; flex-direction: column; gap: var(--gf-s2); z-index: 2000;
        pointer-events: none; align-items: center;
      }
      .toast {
        pointer-events: auto; min-width: 220px; max-width: min(480px, 92vw);
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-2); padding: var(--gf-s3) var(--gf-s4);
        font-family: var(--gf-font-mono); font-size: var(--gf-fs-sm);
        animation: gf-toast-in var(--gf-dur) var(--gf-ease);
      }
      .toast[data-variant="ok"] { background: var(--gf-ok); color: #fff; }
      .toast[data-variant="danger"] { background: var(--gf-danger); color: #fff; }
      @keyframes gf-toast-in { from { transform: translateY(8px); opacity: 0; } }
    `
  }

  private readonly stack = document.createElement('div')

  protected override template(): string {
    return ''
  }

  protected override mounted(): void {
    this.root.appendChild(this.stack)
  }

  push(message: string, variant: string, duration: number): void {
    const node = document.createElement('div')
    node.className = 'toast'
    node.dataset.variant = variant
    node.setAttribute('role', 'status')
    node.textContent = message
    this.stack.appendChild(node)
    window.setTimeout(() => node.remove(), duration)
  }
}

define('gf-modal', GFModal)
define('gf-menu', GFMenu)
define('gf-toaster', GFToaster)

let toaster: GFToaster | null = null

function ensureToaster(): GFToaster {
  if (!toaster || !toaster.isConnected) {
    toaster = document.createElement('gf-toaster') as GFToaster
    document.body.appendChild(toaster)
  }
  return toaster
}

export interface ToastOptions {
  variant?: 'default' | 'ok' | 'danger'
  duration?: number
}

export function toast(message: string, options: ToastOptions = {}): void {
  const host = ensureToaster()
  window.requestAnimationFrame(() =>
    host.push(message, options.variant ?? 'default', options.duration ?? 3200),
  )
}

declare global {
  interface HTMLElementTagNameMap {
    'gf-modal': GFModal
    'gf-menu': GFMenu
    'gf-toaster': GFToaster
  }
}
