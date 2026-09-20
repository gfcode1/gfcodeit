import { initSDK, type GFApi } from '../src/core/sdk'
import { setAssetBase } from '../src/core/icons'
import '../src/ui/index'

// The runtime lives at <base>framework/v1/gf-runtime.js; assets are two levels up.
setAssetBase(new URL('../../', import.meta.url).href)

declare global {
  interface Window {
    GF: GFApi
    GF_READY: Promise<GFApi>
  }
}

window.GF_READY = initSDK().then((api) => {
  window.GF = api
  window.dispatchEvent(new CustomEvent('gf-ready', { detail: api }))
  return api
})
