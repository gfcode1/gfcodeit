import { GFElement, define } from './base'

const FIELD = `
  :host { display: block; color: var(--gf-ink); font-family: var(--gf-font-sans); }
  input, textarea {
    width: 100%; background: var(--gf-surface); color: var(--gf-ink);
    border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
    padding: var(--gf-s2) var(--gf-s3); font: inherit; font-size: var(--gf-fs-md);
    transition: box-shadow var(--gf-dur-fast) var(--gf-ease);
  }
  input::placeholder, textarea::placeholder { color: var(--gf-muted); }
  input:focus, textarea:focus { outline: none; box-shadow: var(--gf-shadow-1); }
  :host([invalid]) input, :host([invalid]) textarea { border-color: var(--gf-danger); box-shadow: 2px 2px 0 var(--gf-danger); }
  :host([disabled]) input, :host([disabled]) textarea { opacity: .5; cursor: not-allowed; }
`

export class GFInput extends GFElement {
  static readonly observedAttributes = ['value', 'placeholder', 'type', 'disabled', 'invalid', 'name']

  protected override styles(): string {
    return FIELD
  }

  protected override template(): string {
    return '<input part="input" />'
  }

  protected override mounted(): void {
    const input = this.query<HTMLInputElement>('input')
    if (!input) return
    input.addEventListener('input', () => {
      this.setAttribute('value', input.value)
      this.emit('gf-input', { value: input.value, name: this.getAttribute('name') })
    })
    input.addEventListener('change', () => {
      this.emit('gf-change', { value: input.value, name: this.getAttribute('name') })
    })
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  get value(): string {
    return this.query<HTMLInputElement>('input')?.value ?? ''
  }

  set value(next: string) {
    this.setAttribute('value', next)
  }

  override focus(options?: FocusOptions): void {
    this.query<HTMLInputElement>('input')?.focus(options)
  }

  private sync(): void {
    const input = this.query<HTMLInputElement>('input')
    if (!input) return
    const value = this.getAttribute('value') ?? ''
    if (input.value !== value) input.value = value
    input.placeholder = this.getAttribute('placeholder') ?? ''
    input.type = this.getAttribute('type') ?? 'text'
    input.disabled = this.hasAttribute('disabled')
  }
}

export class GFTextarea extends GFElement {
  static readonly observedAttributes = ['value', 'placeholder', 'rows', 'disabled', 'invalid', 'name']

  protected override styles(): string {
    return `${FIELD} textarea { min-height: 96px; resize: vertical; line-height: 1.5; }`
  }

  protected override template(): string {
    return '<textarea part="textarea"></textarea>'
  }

  protected override mounted(): void {
    const area = this.query<HTMLTextAreaElement>('textarea')
    if (!area) return
    area.addEventListener('input', () => {
      this.setAttribute('value', area.value)
      this.emit('gf-input', { value: area.value, name: this.getAttribute('name') })
    })
    area.addEventListener('change', () => {
      this.emit('gf-change', { value: area.value, name: this.getAttribute('name') })
    })
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  get value(): string {
    return this.query<HTMLTextAreaElement>('textarea')?.value ?? ''
  }

  set value(next: string) {
    this.setAttribute('value', next)
  }

  private sync(): void {
    const area = this.query<HTMLTextAreaElement>('textarea')
    if (!area) return
    const value = this.getAttribute('value') ?? ''
    if (area.value !== value) area.value = value
    area.placeholder = this.getAttribute('placeholder') ?? ''
    area.rows = Number(this.getAttribute('rows') ?? '4')
    area.disabled = this.hasAttribute('disabled')
  }
}

export class GFFormField extends GFElement {
  static readonly observedAttributes = ['label', 'help', 'error', 'required']

  protected override styles(): string {
    return `
      :host { display: block; color: var(--gf-ink); }
      .label { font-family: var(--gf-font-mono); font-size: var(--gf-fs-xs); letter-spacing: .08em; text-transform: uppercase; margin-bottom: var(--gf-s1); display: block; }
      .label .req { color: var(--gf-danger); }
      .msg { font-size: var(--gf-fs-xs); margin-top: var(--gf-s1); color: var(--gf-muted); font-family: var(--gf-font-mono); }
      .msg.error { color: var(--gf-danger); }
    `
  }

  protected override template(): string {
    return `
      <label class="label"><span class="label-text"></span><span class="req"></span></label>
      <slot></slot>
      <div class="msg"></div>
    `
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const labelText = this.query('.label-text')
    const req = this.query('.req')
    const msg = this.query<HTMLElement>('.msg')
    if (labelText) labelText.textContent = this.getAttribute('label') ?? ''
    if (req) req.textContent = this.hasAttribute('required') ? '*' : ''
    if (!msg) return
    const error = this.getAttribute('error')
    const help = this.getAttribute('help')
    if (error) {
      msg.textContent = error
      msg.className = 'msg error'
    } else {
      msg.textContent = help ?? ''
      msg.className = 'msg'
    }
  }
}

export class GFCheckbox extends GFElement {
  static readonly observedAttributes = ['checked', 'disabled', 'name']

  protected override styles(): string {
    return `
      :host { display: inline-block; color: var(--gf-ink); }
      label { display: inline-flex; align-items: center; gap: var(--gf-s2); cursor: pointer; }
      .box {
        width: 20px; height: 20px; border: var(--gf-border-w) solid var(--gf-ink);
        background: var(--gf-surface); display: grid; place-items: center;
      }
      .box::after { content: ""; width: 10px; height: 10px; background: var(--gf-accent); opacity: 0; }
      :host([checked]) .box::after { opacity: 1; }
      :host([disabled]) label { opacity: .5; cursor: not-allowed; }
    `
  }

  protected override template(): string {
    return '<label><span class="box" part="box"></span><span class="text"><slot></slot></span></label>'
  }

  protected override mounted(): void {
    this.query('label')?.addEventListener('click', (event) => {
      if (this.hasAttribute('disabled')) {
        event.preventDefault()
        return
      }
      const next = !this.hasAttribute('checked')
      this.toggleAttribute('checked', next)
      this.emit('gf-change', { checked: next, name: this.getAttribute('name') })
    })
  }

  get checked(): boolean {
    return this.hasAttribute('checked')
  }

  set checked(next: boolean) {
    this.toggleAttribute('checked', next)
  }
}

export class GFSwitch extends GFElement {
  static readonly observedAttributes = ['checked', 'disabled', 'name']

  protected override styles(): string {
    return `
      :host { display: inline-block; color: var(--gf-ink); }
      button {
        display: inline-flex; align-items: center; gap: var(--gf-s2);
        border: var(--gf-border-w) solid var(--gf-ink); background: var(--gf-surface);
        padding: 2px; min-width: 56px; border-radius: var(--gf-radius);
      }
      .knob { width: 20px; height: 20px; background: var(--gf-ink); transition: transform var(--gf-dur-fast) var(--gf-ease); }
      :host([checked]) button { background: var(--gf-accent); }
      :host([checked]) .knob { transform: translateX(24px); }
      :host([disabled]) button { opacity: .5; cursor: not-allowed; }
    `
  }

  protected override template(): string {
    return '<button type="button" role="switch"><span class="knob" part="knob"></span></button>'
  }

  protected override mounted(): void {
    const button = this.query<HTMLButtonElement>('button')
    if (!button) return
    const sync = () => button.setAttribute('aria-checked', String(this.hasAttribute('checked')))
    sync()
    button.addEventListener('click', () => {
      if (this.hasAttribute('disabled')) return
      const next = !this.hasAttribute('checked')
      this.toggleAttribute('checked', next)
      sync()
      this.emit('gf-change', { checked: next, name: this.getAttribute('name') })
    })
  }

  attributeChangedCallback(): void {
    this.query<HTMLButtonElement>('button')?.setAttribute('aria-checked', String(this.hasAttribute('checked')))
  }

  get checked(): boolean {
    return this.hasAttribute('checked')
  }

  set checked(next: boolean) {
    this.toggleAttribute('checked', next)
  }
}

define('gf-input', GFInput)
define('gf-textarea', GFTextarea)
define('gf-form-field', GFFormField)
define('gf-checkbox', GFCheckbox)
define('gf-switch', GFSwitch)

declare global {
  interface HTMLElementTagNameMap {
    'gf-input': GFInput
    'gf-textarea': GFTextarea
    'gf-form-field': GFFormField
    'gf-checkbox': GFCheckbox
    'gf-switch': GFSwitch
  }
}
