/**
 * Global CSS does not cross the Shadow DOM boundary, so each component root
 * needs its own reset (notably `box-sizing`, otherwise width:100% + padding
 * overflows the host).
 */
const GF_RESET = `
  :host { box-sizing: border-box; }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; color: inherit; }
  [hidden] { display: none !important; }
`

export abstract class GFElement extends HTMLElement {
  protected readonly root: ShadowRoot
  private rendered = false

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    if (this.rendered) return
    this.rendered = true
    this.root.innerHTML = `<style>${GF_RESET}${this.styles()}</style>${this.template()}`
    this.mounted()
  }

  protected styles(): string {
    return ''
  }

  protected template(): string {
    return ''
  }

  protected mounted(): void {
    /* override */
  }

  protected query<T extends Element = HTMLElement>(selector: string): T | null {
    return this.root.querySelector<T>(selector)
  }

  protected emit<T>(name: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }))
  }
}

export function define(name: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, ctor)
}
