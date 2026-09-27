import { existsSync, statSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, net, protocol, session, shell, Tray } from 'electron'

// The desktop shell serves the built site from a custom standard scheme so that
// the shell and its app iframes share a real origin (same-origin postMessage,
// fetch, IndexedDB, audio ranges). file:// would give an opaque origin and break
// the bridge, so it is deliberately not used.
const APP_ORIGIN = 'app://gfcodeit'
const DEV_URL = process.env.GF_DESKTOP_URL ?? ''

const dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = resolve(dirname, '..', 'dist')

/** @type {BrowserWindow | null} */
let win = null
/** @type {Tray | null} */
let tray = null
let quitting = false

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

function iconPath() {
  for (const candidate of [
    join(DIST, 'icons', 'icon-192.png'),
    join(dirname, '..', 'public', 'icons', 'icon-192.png'),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function serveApp(request) {
  const url = new URL(request.url)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const filePath = normalize(join(DIST, pathname))
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    return new Response('Forbidden', { status: 403 })
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new Response('Not found', { status: 404 })
  }
  return net.fetch(pathToFileURL(filePath).toString())
}

function setupPermissions() {
  // Native notifications drive the scheduler's reminders; fullscreen is allowed
  // for the media viewer. Everything else falls back to the default policy.
  const allowed = new Set(['notifications', 'fullscreen'])
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission))
  })
}

function isInternal(url) {
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith(APP_ORIGIN)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 360,
    minHeight: 520,
    backgroundColor: '#f4f4ef',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: join(dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Timers and alarms must keep running while the window is in the tray.
      backgroundThrottling: false,
    },
  })

  // External links open in the system browser, never inside the shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url)) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  // Closing hides to the tray; quitting is explicit (tray menu or Cmd/Ctrl+Q).
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window.hide()
  })

  return window
}

function showWindow() {
  if (!win) {
    win = createWindow()
    void win.loadURL(DEV_URL || `${APP_ORIGIN}/index.html`)
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray() {
  const path = iconPath()
  if (!path) return
  tray = new Tray(nativeImage.createFromPath(path).resize({ width: 22, height: 22 }))
  tray.setToolTip('GFCode')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show GFCode', click: () => showWindow() },
      { label: 'Hide', click: () => win?.hide() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => showWindow())
}

function registerMediaKeys() {
  const keys = {
    MediaPlayPause: 'playpause',
    MediaStop: 'stop',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'previous',
  }
  for (const [accelerator, action] of Object.entries(keys)) {
    // Registration can fail on Wayland or when another app owns the key.
    const ok = globalShortcut.register(accelerator, () => win?.webContents.send('gf:media-key', action))
    if (!ok) console.warn(`[desktop] media key unavailable: ${accelerator}`)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    protocol.handle('app', serveApp)
    setupPermissions()
    win = createWindow()
    createTray()
    registerMediaKeys()
    void win.loadURL(DEV_URL || `${APP_ORIGIN}/index.html`)
  })

  // The app lives in the tray, so closing the window must not quit it.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
