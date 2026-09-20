import { GFElement, define } from './base'

const BASE = `
  :host { display: block; color: var(--gf-ink); font-family: var(--gf-font-sans); }
  select, input, button { font: inherit; }
`

export class GFSelect extends GFElement {
  static readonly observedAttributes = ['value', 'disabled', 'placeholder', 'name']

  protected override styles(): string {
    return `
      ${BASE}
      select {
        width: 100%; min-height: 40px; padding: 0 var(--gf-s3);
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
        appearance: none;
      }
      select:focus { outline: none; box-shadow: var(--gf-shadow-1); }
      :host([disabled]) select { opacity: .5; cursor: not-allowed; }
    `
  }

  protected override template(): string {
    return '<select part="select"></select>'
  }

  protected override mounted(): void {
    const select = this.query<HTMLSelectElement>('select')!
    for (const option of Array.from(this.querySelectorAll('option'))) {
      const clone = document.createElement('option')
      clone.value = option.value
      clone.textContent = option.textContent
      if (option.disabled) clone.disabled = true
      select.append(clone)
    }
    select.addEventListener('change', () => {
      this.setAttribute('value', select.value)
      this.emit('gf-change', { value: select.value, name: this.getAttribute('name') })
    })
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  get value(): string {
    return this.query<HTMLSelectElement>('select')?.value ?? ''
  }

  set value(next: string) {
    this.setAttribute('value', next)
  }

  private sync(): void {
    const select = this.query<HTMLSelectElement>('select')
    if (!select) return
    const placeholder = this.getAttribute('placeholder')
    if (placeholder) {
      let option = select.querySelector('option[data-placeholder]') as HTMLOptionElement | null
      if (!option) {
        option = document.createElement('option')
        option.dataset.placeholder = ''
        option.disabled = true
        option.hidden = true
        select.prepend(option)
      }
      option.textContent = placeholder
    }
    const value = this.getAttribute('value')
    if (value !== null) select.value = value
    select.disabled = this.hasAttribute('disabled')
  }
}

export interface RadioOption {
  value: string
  label: string
  disabled?: boolean
}

export class GFRadioGroup extends GFElement {
  static readonly observedAttributes = ['value', 'options', 'disabled', 'name']

  private renderOptions(): RadioOption[] {
    try {
      const raw = this.getAttribute('options')
      return raw ? (JSON.parse(raw) as RadioOption[]) : []
    } catch {
      return []
    }
  }

  protected override styles(): string {
    return `
      ${BASE}
      .group { display: flex; flex-direction: column; gap: var(--gf-s2); }
      label { display: inline-flex; align-items: center; gap: var(--gf-s2); cursor: pointer; }
      .dot { width: 18px; height: 18px; border: var(--gf-border-w) solid var(--gf-ink); display: grid; place-items: center; }
      .dot::after { content: ""; width: 8px; height: 8px; background: var(--gf-accent); opacity: 0; }
      label.is-checked .dot::after { opacity: 1; }
      :host([disabled]) label { opacity: .5; cursor: not-allowed; }
    `
  }

  protected override template(): string {
    return '<div class="group" role="radiogroup"></div>'
  }

  protected override mounted(): void {
    this.render()
  }

  attributeChangedCallback(): void {
    this.render()
  }

  private render(): void {
    const group = this.query('.group')
    if (!group) return
    group.innerHTML = ''
    const current = this.getAttribute('value')
    for (const option of this.renderOptions()) {
      const label = document.createElement('label')
      if (option.value === current) label.classList.add('is-checked')
      const dot = document.createElement('span')
      dot.className = 'dot'
      const text = document.createElement('span')
      text.textContent = option.label
      label.append(dot, text)
      label.addEventListener('click', () => {
        if (this.hasAttribute('disabled') || option.disabled) return
        this.setAttribute('value', option.value)
        this.emit('gf-change', { value: option.value, name: this.getAttribute('name') })
      })
      group.append(label)
    }
  }
}

export class GFSlider extends GFElement {
  static readonly observedAttributes = ['value', 'min', 'max', 'step', 'disabled', 'name']

  protected override styles(): string {
    return `
      ${BASE}
      input[type="range"] {
        width: 100%; appearance: none; height: 24px; background: transparent; margin: 0;
      }
      input[type="range"]::-webkit-slider-runnable-track {
        height: 6px; background: var(--gf-surface-2); border: 2px solid var(--gf-ink);
      }
      input[type="range"]::-webkit-slider-thumb {
        appearance: none; width: 18px; height: 18px; margin-top: -8px;
        background: var(--gf-accent); border: 2px solid var(--gf-ink);
      }
      input[type="range"]::-moz-range-track { height: 6px; background: var(--gf-surface-2); border: 2px solid var(--gf-ink); }
      input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 0; background: var(--gf-accent); border: 2px solid var(--gf-ink); }
    `
  }

  protected override template(): string {
    return '<input type="range" part="slider" />'
  }

  protected override mounted(): void {
    const input = this.query<HTMLInputElement>('input')!
    input.addEventListener('input', () => {
      this.setAttribute('value', input.value)
      this.emit('gf-input', { value: Number(input.value), name: this.getAttribute('name') })
    })
    input.addEventListener('change', () => {
      this.emit('gf-change', { value: Number(input.value), name: this.getAttribute('name') })
    })
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  get value(): number {
    return Number(this.query<HTMLInputElement>('input')?.value ?? 0)
  }

  set value(next: number) {
    this.setAttribute('value', String(next))
  }

  private sync(): void {
    const input = this.query<HTMLInputElement>('input')
    if (!input) return
    input.min = this.getAttribute('min') ?? '0'
    input.max = this.getAttribute('max') ?? '100'
    input.step = this.getAttribute('step') ?? '1'
    const value = this.getAttribute('value')
    if (value !== null && input.value !== value) input.value = value
    input.disabled = this.hasAttribute('disabled')
  }
}

export class GFProgress extends GFElement {
  static readonly observedAttributes = ['value', 'max', 'label']

  protected override styles(): string {
    return `
      ${BASE}
      .track {
        height: 16px; border: var(--gf-border-w) solid var(--gf-ink);
        background: var(--gf-surface); overflow: hidden;
      }
      .bar { height: 100%; background: var(--gf-accent); transition: width var(--gf-dur) var(--gf-ease); }
      .label { font-family: var(--gf-font-mono); font-size: var(--gf-fs-xs); margin-bottom: var(--gf-s1); display: flex; justify-content: space-between; }
    `
  }

  protected override template(): string {
    return '<div class="label"><span class="text"></span><span class="pct"></span></div><div class="track"><div class="bar" part="bar"></div></div>'
  }

  protected override mounted(): void {
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const value = Number(this.getAttribute('value') ?? '0')
    const max = Number(this.getAttribute('max') ?? '100')
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
    const bar = this.query<HTMLElement>('.bar')
    if (bar) bar.style.width = `${pct}%`
    const text = this.query('.text')
    const pctLabel = this.query('.pct')
    if (text) text.textContent = this.getAttribute('label') ?? ''
    if (pctLabel) pctLabel.textContent = `${Math.round(pct)}%`
  }
}

export class GFAccordionItem extends GFElement {
  static readonly observedAttributes = ['title', 'open']

  protected override styles(): string {
    return `
      ${BASE}
      .head {
        display: flex; align-items: center; justify-content: space-between; gap: var(--gf-s3);
        padding: var(--gf-s3); border: var(--gf-border-w) solid var(--gf-ink);
        background: var(--gf-surface); cursor: pointer; width: 100%; text-align: left;
        font-family: var(--gf-font-mono); text-transform: uppercase; letter-spacing: .05em; font-size: var(--gf-fs-sm);
      }
      .head .mark { font-size: var(--gf-fs-lg); line-height: 1; }
      .body { border: var(--gf-border-w) solid var(--gf-ink); border-top: none; padding: var(--gf-s3); display: none; background: var(--gf-surface); }
      :host([open]) .body { display: block; }
    `
  }

  protected override template(): string {
    return '<button class="head" type="button" part="head"><span class="title"></span><span class="mark">+</span></button><div class="body"><slot></slot></div>'
  }

  protected override mounted(): void {
    this.query('.head')!.addEventListener('click', () => this.toggleAttribute('open'))
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const title = this.query('.title')
    const mark = this.query('.mark')
    if (title) title.textContent = this.getAttribute('title') ?? ''
    if (mark) mark.textContent = this.hasAttribute('open') ? '−' : '+'
  }
}

export class GFAccordion extends GFElement {
  protected override styles(): string {
    return ':host { display: block; }'
  }

  protected override template(): string {
    return '<slot></slot>'
  }

  protected override mounted(): void {
    this.addEventListener('click', (event) => {
      if (!this.hasAttribute('exclusive')) return
      const path = event.composedPath()
      const item = path.find((node) => node instanceof GFAccordionItem) as GFAccordionItem | undefined
      if (!item) return
      for (const child of Array.from(this.querySelectorAll('gf-accordion-item'))) {
        if (child !== item) (child as GFAccordionItem).removeAttribute('open')
      }
    })
  }
}

define('gf-select', GFSelect)
define('gf-radio-group', GFRadioGroup)
define('gf-slider', GFSlider)
define('gf-progress', GFProgress)
define('gf-accordion', GFAccordion)
define('gf-accordion-item', GFAccordionItem)

declare global {
  interface HTMLElementTagNameMap {
    'gf-select': GFSelect
    'gf-radio-group': GFRadioGroup
    'gf-slider': GFSlider
    'gf-progress': GFProgress
    'gf-accordion': GFAccordion
    'gf-accordion-item': GFAccordionItem
  }
}
