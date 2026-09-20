import { GFElement, define } from './base'

const SHARED = `
  :host { display: block; color: var(--gf-ink); font-family: var(--gf-font-sans); }
  .mono { font-family: var(--gf-font-mono); letter-spacing: .06em; text-transform: uppercase; }
`

export class GFButton extends GFElement {
  static readonly observedAttributes = ['disabled', 'variant', 'size', 'block']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: inline-block; }
      :host([block]) { display: block; }
      button {
        display: inline-flex; align-items: center; justify-content: center; gap: var(--gf-s2);
        width: 100%; min-height: 40px; padding: 0 var(--gf-s4);
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink);
        border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-2);
        font-family: var(--gf-font-mono); font-size: var(--gf-fs-sm);
        letter-spacing: .06em; text-transform: uppercase;
        transition: transform var(--gf-dur-fast) var(--gf-ease), box-shadow var(--gf-dur-fast) var(--gf-ease),
          background var(--gf-dur-fast) var(--gf-ease), color var(--gf-dur-fast) var(--gf-ease);
      }
      button:hover:not(:disabled) { background: var(--gf-ink); color: var(--gf-paper); }
      button:active:not(:disabled) { transform: translate(4px,4px); box-shadow: 0 0 0 var(--gf-ink); }
      :host([variant="primary"]) button { background: var(--gf-accent); color: var(--gf-accent-ink); border-color: var(--gf-ink); }
      :host([variant="primary"]) button:hover:not(:disabled) { background: var(--gf-ink); color: var(--gf-paper); }
      :host([variant="danger"]) button { background: var(--gf-danger); color: #fff; }
      :host([variant="danger"]) button:hover:not(:disabled) { background: var(--gf-ink); color: var(--gf-paper); }
      :host([variant="ghost"]) button { box-shadow: none; background: transparent; }
      :host([variant="ghost"]) button:hover:not(:disabled) { background: var(--gf-ink); color: var(--gf-paper); }
      :host([size="sm"]) button { min-height: 30px; padding: 0 var(--gf-s3); font-size: var(--gf-fs-xs); }
      button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
    `
  }

  protected override template(): string {
    return '<button part="button" type="button"><slot name="icon"></slot><span class="label"><slot></slot></span></button>'
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const button = this.query<HTMLButtonElement>('button')
    if (!button) return
    button.disabled = this.hasAttribute('disabled')
  }
}

export class GFCard extends GFElement {
  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: block; }
      .card {
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink);
        border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-2);
        padding: var(--gf-s4);
      }
      :host([flat]) .card { box-shadow: none; }
    `
  }

  protected override template(): string {
    return '<div class="card" part="card"><slot></slot></div>'
  }
}

export class GFBadge extends GFElement {
  static readonly observedAttributes = ['variant']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: inline-block; }
      .badge {
        display: inline-block; padding: 2px var(--gf-s2);
        border: 2px solid var(--gf-ink); border-radius: var(--gf-radius);
        font-family: var(--gf-font-mono); font-size: var(--gf-fs-xs);
        letter-spacing: .06em; text-transform: uppercase; line-height: 1.4;
      }
      :host([variant="accent"]) .badge { background: var(--gf-accent); color: var(--gf-accent-ink); }
      :host([variant="solid"]) .badge { background: var(--gf-ink); color: var(--gf-paper); }
    `
  }

  protected override template(): string {
    return '<span class="badge" part="badge"><slot></slot></span>'
  }
}

export class GFChip extends GFElement {
  static readonly observedAttributes = ['active']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: inline-block; }
      button {
        min-height: 30px; padding: 0 var(--gf-s3);
        background: var(--gf-surface); color: var(--gf-ink);
        border: 2px solid var(--gf-ink); border-radius: var(--gf-radius);
        font-family: var(--gf-font-mono); font-size: var(--gf-fs-xs);
        letter-spacing: .06em; text-transform: uppercase;
      }
      button:hover { background: var(--gf-ink); color: var(--gf-paper); }
      :host([active]) button { background: var(--gf-accent); color: var(--gf-accent-ink); }
    `
  }

  protected override template(): string {
    return '<button type="button" part="chip"><slot></slot></button>'
  }

  protected override mounted(): void {
    this.query('button')?.addEventListener('click', () => {
      this.emit('gf-chip-toggle', { active: !this.hasAttribute('active') })
    })
  }
}

export class GFAvatar extends GFElement {
  static readonly observedAttributes = ['codepoint', 'size', 'accent']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: inline-block; }
      .avatar {
        display: inline-grid; place-items: center; position: relative;
        width: var(--gf-avatar-size, 36px); height: var(--gf-avatar-size, 36px);
        background: var(--gf-accent); color: var(--gf-accent-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
      }
    `
  }

  protected override template(): string {
    return '<span class="avatar" part="avatar"><gf-icon codepoint="1F464" size="60%"></gf-icon></span>'
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const size = this.getAttribute('size') ?? '36px'
    this.style.setProperty('--gf-avatar-size', size)
    const accent = this.getAttribute('accent')
    const avatar = this.query<HTMLElement>('.avatar')
    if (avatar) avatar.style.background = accent ?? ''
    const icon = this.query('gf-icon')
    const codepoint = this.getAttribute('codepoint')
    if (icon && codepoint) icon.setAttribute('codepoint', codepoint)
  }
}

export class GFDivider extends GFElement {
  protected override styles(): string {
    return `:host { display: block; height: 0; border-top: 2px solid var(--gf-line); margin: var(--gf-s4) 0; }`
  }
}

export class GFSpinner extends GFElement {
  protected override styles(): string {
    return `
      :host { display: inline-block; }
      .square {
        width: var(--gf-spinner-size, 18px); height: var(--gf-spinner-size, 18px);
        border: 3px solid var(--gf-ink); border-right-color: var(--gf-accent);
        animation: gf-spin 700ms steps(8) infinite;
      }
      @keyframes gf-spin { to { transform: rotate(360deg); } }
    `
  }

  protected override template(): string {
    return '<span class="square" part="spinner" role="status" aria-label="Loading"></span>'
  }
}

export class GFSkeleton extends GFElement {
  static readonly observedAttributes = ['height', 'width']

  protected override styles(): string {
    return `
      :host { display: block; }
      .block {
        height: var(--h, 16px); width: var(--w, 100%);
        background: var(--gf-surface-2); border: 2px solid var(--gf-line);
        animation: gf-pulse 1s steps(2) infinite;
      }
      @keyframes gf-pulse { 50% { opacity: .45; } }
    `
  }

  protected override template(): string {
    return '<span class="block" part="skeleton"></span>'
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    this.style.setProperty('--h', this.getAttribute('height') ?? '16px')
    this.style.setProperty('--w', this.getAttribute('width') ?? '100%')
  }
}

export class GFEmptyState extends GFElement {
  static readonly observedAttributes = ['icon', 'title', 'text']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: block; text-align: center; padding: var(--gf-s6) var(--gf-s4); }
      .icon { margin-bottom: var(--gf-s3); opacity: .8; }
      h3 { font-family: var(--gf-font-mono); text-transform: uppercase; letter-spacing: .06em; font-size: var(--gf-fs-md); }
      p { color: var(--gf-muted); font-size: var(--gf-fs-sm); margin-top: var(--gf-s2); }
      .actions { margin-top: var(--gf-s4); }
    `
  }

  protected override template(): string {
    return `
      <div class="icon"><gf-icon size="40px" codepoint="1F5C2"></gf-icon></div>
      <h3 class="title"></h3>
      <p class="text"></p>
      <div class="actions"><slot></slot></div>
    `
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const title = this.query('.title')
    const text = this.query('.text')
    const icon = this.query('gf-icon')
    if (title) title.textContent = this.getAttribute('title') ?? ''
    if (text) text.textContent = this.getAttribute('text') ?? ''
    const cp = this.getAttribute('icon')
    if (icon && cp) icon.setAttribute('codepoint', cp)
  }
}

export class GFPageHeader extends GFElement {
  static readonly observedAttributes = ['title', 'subtitle']

  protected override styles(): string {
    return `
      ${SHARED}
      :host { display: block; margin-bottom: var(--gf-s4); }
      .head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--gf-s4); flex-wrap: wrap; }
      h1 { font-size: var(--gf-fs-xl); letter-spacing: -.01em; }
      .subtitle { color: var(--gf-muted); font-size: var(--gf-fs-sm); margin-top: var(--gf-s1); }
      .actions { display: flex; gap: var(--gf-s2); }
    `
  }

  protected override template(): string {
    return `
      <div class="head">
        <div><h1 class="title"></h1><div class="subtitle"></div></div>
        <div class="actions"><slot name="actions"></slot></div>
      </div>
    `
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const title = this.query('.title')
    const subtitle = this.query('.subtitle')
    if (title) title.textContent = this.getAttribute('title') ?? ''
    if (subtitle) subtitle.textContent = this.getAttribute('subtitle') ?? ''
  }
}

define('gf-button', GFButton)
define('gf-card', GFCard)
define('gf-badge', GFBadge)
define('gf-chip', GFChip)
define('gf-avatar', GFAvatar)
define('gf-divider', GFDivider)
define('gf-spinner', GFSpinner)
define('gf-skeleton', GFSkeleton)
define('gf-empty-state', GFEmptyState)
define('gf-page-header', GFPageHeader)

declare global {
  interface HTMLElementTagNameMap {
    'gf-button': GFButton
    'gf-card': GFCard
    'gf-badge': GFBadge
    'gf-chip': GFChip
    'gf-avatar': GFAvatar
    'gf-divider': GFDivider
    'gf-spinner': GFSpinner
    'gf-skeleton': GFSkeleton
    'gf-empty-state': GFEmptyState
    'gf-page-header': GFPageHeader
  }
}
