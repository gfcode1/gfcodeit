import { GFElement, define } from './base'
import { loadIconIndex, type IconMeta } from '../core/icons'

const LIMIT = 240

export class GFEmojiPicker extends GFElement {
  private items: IconMeta[] = []
  private filter = ''

  protected override styles(): string {
    return `
      :host { display: block; }
      .wrap { display: flex; flex-direction: column; gap: var(--gf-s3); }
      .grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
        gap: var(--gf-s1); max-height: 320px; overflow: auto;
        border: 2px solid var(--gf-ink); padding: var(--gf-s2); background: var(--gf-surface);
      }
      button {
        display: grid; place-items: center; aspect-ratio: 1;
        border: 2px solid transparent; background: none;
      }
      button:hover { border-color: var(--gf-ink); background: var(--gf-surface-2); }
      .count { font-family: var(--gf-font-mono); font-size: var(--gf-fs-xs); color: var(--gf-muted); }
    `
  }

  protected override template(): string {
    return `
      <div class="wrap">
        <gf-input placeholder="Search emoji…"></gf-input>
        <div class="count"></div>
        <div class="grid" role="listbox"></div>
      </div>
    `
  }

  protected override mounted(): void {
    this.query('gf-input')?.addEventListener('gf-input', (event) => {
      this.filter = ((event as CustomEvent<{ value: string }>).detail.value ?? '').toLowerCase()
      this.renderGrid()
    })
    void this.load()
  }

  private async load(): Promise<void> {
    this.items = await loadIconIndex()
    this.renderGrid()
  }

  private renderGrid(): void {
    const grid = this.query('.grid')
    const count = this.query('.count')
    if (!grid) return
    grid.innerHTML = ''
    const filtered = this.filter
      ? this.items.filter((item) =>
          `${item.name} ${item.tags} ${item.group}`.toLowerCase().includes(this.filter),
        )
      : this.items
    const slice = filtered.slice(0, LIMIT)
    for (const item of slice) {
      const button = document.createElement('button')
      button.type = 'button'
      button.title = item.name
      button.setAttribute('role', 'option')
      const icon = document.createElement('gf-icon')
      icon.setAttribute('codepoint', item.hexcode)
      icon.setAttribute('variant', 'color')
      icon.setAttribute('size', '26px')
      button.append(icon)
      button.addEventListener('click', () => this.emit('gf-pick', { hexcode: item.hexcode, name: item.name }))
      grid.append(button)
    }
    if (count) count.textContent = `${filtered.length} emoji${filtered.length > LIMIT ? ' (showing first ' + LIMIT + ')' : ''}`
  }
}

define('gf-emoji-picker', GFEmojiPicker)

declare global {
  interface HTMLElementTagNameMap {
    'gf-emoji-picker': GFEmojiPicker
  }
}
