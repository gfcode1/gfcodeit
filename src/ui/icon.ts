import { GFElement, define } from './base'
import { colorIconUrl, emojiToHex, iconUrl } from '../core/icons'

export class GFIcon extends GFElement {
  static readonly observedAttributes = ['codepoint', 'emoji', 'size', 'label', 'variant']

  protected override styles(): string {
    return `
      :host { display: inline-block; line-height: 0; vertical-align: text-bottom; }
      .box {
        display: inline-block;
        width: 1em; height: 1em;
        background: currentColor;
        -webkit-mask: var(--u) center / contain no-repeat;
        mask: var(--u) center / contain no-repeat;
      }
    `
  }

  protected override template(): string {
    return '<span class="box" part="icon"></span>'
  }

  protected override mounted(): void {
    this.update()
  }

  attributeChangedCallback(): void {
    this.update()
  }

  private update(): void {
    const box = this.query<HTMLSpanElement>('.box')
    if (!box) return

    const codepoint =
      this.getAttribute('codepoint') ??
      (this.getAttribute('emoji') ? emojiToHex(this.getAttribute('emoji')!) : '')
    if (!codepoint) return

    const size = this.getAttribute('size') ?? '1em'
    box.style.width = size
    box.style.height = size

    if (this.getAttribute('variant') === 'color') {
      box.style.background = 'none'
      box.style.webkitMask = 'none'
      box.style.mask = 'none'
      box.style.backgroundImage = `url("${colorIconUrl(codepoint)}")`
      box.style.backgroundSize = 'contain'
      box.style.backgroundRepeat = 'no-repeat'
      box.style.backgroundPosition = 'center'
    } else {
      box.style.background = 'currentColor'
      box.style.backgroundImage = 'none'
      box.style.backgroundSize = ''
      box.style.backgroundRepeat = ''
      box.style.backgroundPosition = ''
      box.style.webkitMask = ''
      box.style.mask = ''
      box.style.setProperty('--u', `url("${iconUrl(codepoint)}")`)
    }

    const label = this.getAttribute('label')
    if (label) {
      box.setAttribute('role', 'img')
      box.setAttribute('aria-label', label)
    } else {
      box.setAttribute('role', 'presentation')
      box.setAttribute('aria-hidden', 'true')
    }
  }
}

define('gf-icon', GFIcon)

declare global {
  interface HTMLElementTagNameMap {
    'gf-icon': GFIcon
  }
}
