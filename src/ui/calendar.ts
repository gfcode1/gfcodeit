import { GFElement, define } from './base'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export class GFCalendar extends GFElement {
  static readonly observedAttributes = ['value']

  private view: Date = new Date()

  protected override styles(): string {
    return `
      :host { display: block; color: var(--gf-ink); font-family: var(--gf-font-mono); }
      .wrap { border: var(--gf-border-w) solid var(--gf-ink); background: var(--gf-surface); padding: var(--gf-s2); width: 266px; }
      .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--gf-s2); }
      .head button { width: 28px; height: 28px; border: 2px solid var(--gf-ink); background: var(--gf-surface); }
      .head button:hover { background: var(--gf-ink); color: var(--gf-paper); }
      .title { font-size: var(--gf-fs-sm); text-transform: uppercase; letter-spacing: .05em; }
      .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
      .wd { text-align: center; font-size: var(--gf-fs-xs); color: var(--gf-muted); text-transform: uppercase; padding: 2px 0; }
      .day {
        aspect-ratio: 1; display: grid; place-items: center; font-size: var(--gf-fs-sm);
        border: 2px solid transparent; background: none; color: inherit;
      }
      .day:hover { border-color: var(--gf-ink); }
      .day.is-out { color: var(--gf-muted); opacity: .5; }
      .day.is-selected { background: var(--gf-accent); color: var(--gf-accent-ink); }
      .day.is-today { border-color: var(--gf-ink); }
    `
  }

  protected override template(): string {
    return `
      <div class="wrap" part="calendar">
        <div class="head">
          <button class="prev" type="button" aria-label="Previous month">&lsaquo;</button>
          <span class="title"></span>
          <button class="next" type="button" aria-label="Next month">&rsaquo;</button>
        </div>
        <div class="grid"></div>
      </div>
    `
  }

  protected override mounted(): void {
    const initial = parseISODate(this.getAttribute('value') ?? '') ?? new Date()
    this.view = new Date(initial.getFullYear(), initial.getMonth(), 1)
    this.query('.prev')!.addEventListener('click', () => this.shift(-1))
    this.query('.next')!.addEventListener('click', () => this.shift(1))
    this.render()
  }

  attributeChangedCallback(): void {
    const value = parseISODate(this.getAttribute('value') ?? '')
    if (value) this.view = new Date(value.getFullYear(), value.getMonth(), 1)
    this.render()
  }

  private shift(delta: number): void {
    this.view = new Date(this.view.getFullYear(), this.view.getMonth() + delta, 1)
    this.render()
  }

  private render(): void {
    const grid = this.query('.grid')
    const title = this.query('.title')
    if (!grid) return

    const year = this.view.getFullYear()
    const month = this.view.getMonth()
    if (title) {
      title.textContent = this.view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }

    grid.innerHTML = ''
    for (const label of WEEKDAYS) {
      const wd = document.createElement('div')
      wd.className = 'wd'
      wd.textContent = label
      grid.append(wd)
    }

    const first = new Date(year, month, 1)
    const offset = (first.getDay() + 6) % 7 // Monday-first
    const start = new Date(year, month, 1 - offset)
    const selected = this.getAttribute('value')
    const today = toISODate(new Date())

    for (let i = 0; i < 42; i += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      const iso = toISODate(date)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'day'
      button.textContent = String(date.getDate())
      if (date.getMonth() !== month) button.classList.add('is-out')
      if (iso === today) button.classList.add('is-today')
      if (iso === selected) button.classList.add('is-selected')
      button.addEventListener('click', () => {
        this.setAttribute('value', iso)
        this.emit('gf-select', { date: iso })
      })
      grid.append(button)
    }
  }
}

export class GFDatePicker extends GFElement {
  static readonly observedAttributes = ['value', 'placeholder', 'disabled', 'name']

  protected override styles(): string {
    return `
      :host { display: block; position: relative; color: var(--gf-ink); }
      .popover {
        position: absolute; top: calc(100% + var(--gf-s1)); left: 0; z-index: 800;
        display: none; box-shadow: var(--gf-shadow-3); background: var(--gf-paper);
      }
      :host([open]) .popover { display: block; }
    `
  }

  protected override template(): string {
    return '<gf-input readonly></gf-input><div class="popover"><gf-calendar></gf-calendar></div>'
  }

  protected override mounted(): void {
    const input = this.query('gf-input')!
    const calendar = this.query('gf-calendar')!
    input.addEventListener('click', () => {
      if (this.hasAttribute('disabled')) return
      this.toggleAttribute('open')
    })
    calendar.addEventListener('gf-select', (event) => {
      const date = (event as CustomEvent<{ date: string }>).detail.date
      this.setAttribute('value', date)
      this.removeAttribute('open')
      this.emit('gf-change', { value: date, name: this.getAttribute('name') })
    })
    document.addEventListener('click', this.onDocumentClick)
    this.sync()
  }

  disconnectedCallback(): void {
    document.removeEventListener('click', this.onDocumentClick)
  }

  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!event.composedPath().includes(this)) this.removeAttribute('open')
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  get value(): string {
    return this.getAttribute('value') ?? ''
  }

  set value(next: string) {
    this.setAttribute('value', next)
  }

  private sync(): void {
    const input = this.query('gf-input')
    const calendar = this.query('gf-calendar')
    if (!input) return
    input.setAttribute('value', this.getAttribute('value') ?? '')
    input.setAttribute('placeholder', this.getAttribute('placeholder') ?? 'YYYY-MM-DD')
    if (this.hasAttribute('disabled')) input.setAttribute('disabled', '')
    else input.removeAttribute('disabled')
    const value = this.getAttribute('value')
    if (calendar && value) calendar.setAttribute('value', value)
  }
}

define('gf-calendar', GFCalendar)
define('gf-date-picker', GFDatePicker)

declare global {
  interface HTMLElementTagNameMap {
    'gf-calendar': GFCalendar
    'gf-date-picker': GFDatePicker
  }
}
