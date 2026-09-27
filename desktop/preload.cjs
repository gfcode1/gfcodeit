const { contextBridge, ipcRenderer } = require('electron')

// Minimal, sandboxed surface: the shell only needs the global media keys.
// All rendering stays in the page; no Node APIs are exposed.
contextBridge.exposeInMainWorld('gfDesktop', {
  platform: process.platform,
  onMediaKey(callback) {
    const listener = (_event, action) => callback(action)
    ipcRenderer.on('gf:media-key', listener)
    return () => ipcRenderer.removeListener('gf:media-key', listener)
  },
})
