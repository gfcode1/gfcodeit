const MAX_DPR = 3

export function observeResize(element: Element, callback: () => void): () => void {
  const observer = new ResizeObserver(() => callback())
  observer.observe(element)
  return () => observer.disconnect()
}

export interface CanvasSize {
  width: number
  height: number
}

/**
 * Sizes a canvas to the largest box of `aspect` (width / height) that fits in
 * `stage`, backing it with device pixels while keeping CSS-pixel drawing units.
 */
export function fitCanvas(canvas: HTMLCanvasElement, stage: HTMLElement, aspect: number): CanvasSize {
  const availW = Math.max(1, stage.clientWidth)
  const availH = Math.max(1, stage.clientHeight)

  let cssW = availW
  let cssH = cssW / aspect
  if (cssH > availH) {
    cssH = availH
    cssW = cssH * aspect
  }
  cssW = Math.max(1, Math.floor(cssW))
  cssH = Math.max(1, Math.floor(cssH))

  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const pixelW = Math.round(cssW * dpr)
  const pixelH = Math.round(cssH * dpr)
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW
    canvas.height = pixelH
  }

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  return { width: cssW, height: cssH }
}
