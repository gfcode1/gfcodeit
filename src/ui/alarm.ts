import { GFElement, define } from './base'

/** Full-screen alarm overlay with dismiss / snooze / open actions. */
export class GFAlarm extends GFElement {
  static readonly observedAttributes = ['open', 'title', 'body', 'icon', 'kind', 'snooze-label', 'open-label']

  protected override styles(): string {
    return `
      :host { display: contents; color: var(--gf-ink); }
      .backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.62);
        display: none; align-items: center; justify-content: center; padding: var(--gf-s4);
        z-index: 1500;
      }
      :host([open]) .backdrop { display: flex; }
      .panel {
        width: min(420px, 100%); text-align: center;
        background: var(--gf-surface); color: var(--gf-ink);
        border: var(--gf-border-w) solid var(--gf-ink); border-radius: var(--gf-radius);
        box-shadow: var(--gf-shadow-3); padding: var(--gf-s5) var(--gf-s4);
      }
      .icon { display: inline-block; animation: gf-alarm-pulse 1s ease-in-out infinite; }
      :host([kind="alarm"]) .icon { color: var(--gf-danger); }
      .title { font-family: var(--gf-font-mono); text-transform: uppercase; letter-spacing: .06em; font-size: var(--gf-fs-lg); margin-top: var(--gf-s2); }
      .body { margin-top: var(--gf-s2); color: var(--gf-muted); }
      .body:empty { display: none; }
      .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--gf-s2); margin-top: var(--gf-s4); }
      .btn {
        border: var(--gf-border-w) solid var(--gf-ink); background: var(--gf-surface); color: var(--gf-ink);
        padding: var(--gf-s2) var(--gf-s3); border-radius: var(--gf-radius); cursor: pointer;
        font-family: var(--gf-font-mono); text-transform: uppercase; letter-spacing: .04em; font-size: var(--gf-fs-sm);
      }
      .btn:hover { background: var(--gf-ink); color: var(--gf-paper); }
      .btn.primary { background: var(--gf-accent); color: #fff; border-color: var(--gf-ink); }
      .btn[hidden] { display: none; }
      @keyframes gf-alarm-pulse { 50% { transform: scale(1.12); } }
    `
  }

  protected override template(): string {
    return `
      <div class="backdrop">
        <div class="panel" role="alertdialog" aria-modal="true">
          <gf-icon class="icon" size="64px" codepoint="23F0"></gf-icon>
          <div class="title"></div>
          <div class="body"></div>
          <div class="actions">
            <button class="btn snooze" type="button" hidden>Snooze</button>
            <button class="btn open" type="button" hidden>Open</button>
            <button class="btn primary dismiss" type="button">Dismiss</button>
          </div>
        </div>
      </div>
    `
  }

  protected override mounted(): void {
    this.query('.dismiss')?.addEventListener('click', () => this.finish('gf-dismiss'))
    this.query('.snooze')?.addEventListener('click', () => this.finish('gf-snooze'))
    this.query('.open')?.addEventListener('click', () => this.finish('gf-open'))
    this.sync()
  }

  attributeChangedCallback(): void {
    this.sync()
  }

  private sync(): void {
    const icon = this.query('gf-icon')
    if (icon) icon.setAttribute('codepoint', this.getAttribute('icon') || '23F0')
    const title = this.query('.title')
    if (title) title.textContent = this.getAttribute('title') ?? ''
    const body = this.query('.body')
    if (body) body.textContent = this.getAttribute('body') ?? ''

    const snoozeLabel = this.getAttribute('snooze-label')
    const snooze = this.query<HTMLButtonElement>('.snooze')
    if (snooze) {
      snooze.hidden = !snoozeLabel
      if (snoozeLabel) snooze.textContent = snoozeLabel
    }
    const open = this.query<HTMLButtonElement>('.open')
    if (open) open.hidden = !this.hasAttribute('open-label')
  }

  private finish(event: string): void {
    this.close()
    this.emit(event)
  }

  open(): void {
    this.setAttribute('open', '')
    this.query<HTMLButtonElement>('.dismiss')?.focus()
  }

  close(): void {
    this.removeAttribute('open')
  }
}

define('gf-alarm', GFAlarm)

declare global {
  interface HTMLElementTagNameMap {
    'gf-alarm': GFAlarm
  }
}
