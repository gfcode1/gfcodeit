import '../styles/base.css'
import '../ui/index'
import './shell.css'

import { apps, getApp } from '../core/registry'
import { openDB } from '../core/idb'
import {
  addRecent,
  createProfile,
  deleteProfile,
  ensureDefaultProfile,
  getThemeFallback,
  listProfiles,
  setCurrentId,
  setFavorites,
  setThemeFallback,
  toggleFavorite,
  updateProfile,
} from '../core/profile'
import { applyTheme, resolveTheme, watchSystemTheme } from '../core/theme'
import { downloadBackup, exportProfile } from '../core/backup'
import { setAssetBase } from '../core/icons'
import { scheduler } from '../core/scheduler'
import { installAudioUnlock, playAlarm, stopAlarm } from '../core/audio'
import { toast } from '../ui/overlay'
import { AppHost } from './app-host'
import { createLauncher } from './launcher'
import { renderProfiles, renderSettings } from './views'
import { renderActivity } from './activity'
import { openCommandPalette, type Command } from './command-palette'
import { setupPWA } from './pwa'
import {
  ACTIVITY_ROUTE,
  APP_ROUTE_PREFIX,
  HOME_ROUTE,
  PROFILES_ROUTE,
  SETTINGS_ROUTE,
} from '../core/lifecycle'
import type { AppManifest, BridgeMethod, Profile, ScheduleDraft, ScheduleItem, ThemeMode } from '../core/types'

setAssetBase(import.meta.env.BASE_URL)

const topbar = document.getElementById('topbar')!
const view = document.getElementById('view')!
const hostContainer = document.getElementById('host')!
const nav = document.getElementById('nav')!

let profile!: Profile
let appHost: AppHost | null = null
const badges = new Map<string, number>()
let online = navigator.onLine

function setConnection(next: boolean): void {
  online = next
  for (const node of document.querySelectorAll<HTMLElement>('.conn')) {
    node.hidden = next
  }
}

function applyBadges(): void {
  for (const card of document.querySelectorAll<HTMLElement>('.app-card')) {
    const id = card.dataset.appId
    if (!id) continue
    const count = badges.get(id) ?? 0
    const node = card.querySelector<HTMLElement>('.app-card__badge')
    if (node) {
      node.textContent = String(count)
      node.hidden = count === 0
    }
  }
  const total = [...badges.values()].reduce((sum, value) => sum + value, 0)
  const top = document.querySelector<HTMLElement>('.topbar__badge')
  if (top) {
    top.textContent = String(total)
    top.hidden = total === 0
  }
}

const themeState = () => ({
  mode: profile.themeMode,
  accent: profile.accent,
  resolved: resolveTheme(profile.themeMode),
})

const profileSummary = () => ({
  id: profile.id,
  name: profile.name,
  avatar: profile.avatar,
  accent: profile.accent,
})

function setTheme(mode: ThemeMode): void {
  profile = { ...profile, themeMode: mode }
  setThemeFallback(mode)
  applyTheme(mode, profile.accent)
  void updateProfile(profile.id, { themeMode: mode })
  appHost?.notifyTheme()
}

function setAccent(accent: string): void {
  profile = { ...profile, accent }
  applyTheme(profile.themeMode, accent)
  void updateProfile(profile.id, { accent })
  appHost?.notifyTheme()
}

function currentRoute(): string {
  return window.location.hash || HOME_ROUTE
}

function navigate(hash: string): void {
  if (window.location.hash === hash) renderRoute()
  else window.location.hash = hash
}

function navigateHome(): void {
  navigate(HOME_ROUTE)
}

/* ------------------------------- topbar ------------------------------- */

function button(content: string | HTMLElement, label: string, onClick: () => void, variant = 'ghost'): HTMLButtonElement {
  const el = document.createElement('button')
  el.className = 'icon-btn'
  el.type = 'button'
  el.setAttribute('aria-label', label)
  el.title = label
  if (typeof content === 'string') {
    const icon = document.createElement('gf-icon')
    icon.setAttribute('codepoint', content)
    icon.setAttribute('size', '20px')
    el.append(icon)
  } else {
    el.append(content)
  }
  el.addEventListener('click', onClick)
  el.dataset.variant = variant
  return el
}

function renderTopbar(): void {
  topbar.innerHTML = ''
  const isApp = currentRoute().startsWith(APP_ROUTE_PREFIX)
  const appId = isApp ? currentRoute().slice(APP_ROUTE_PREFIX.length) : null
  const app = appId ? getApp(appId) : undefined

  const left = document.createElement('div')
  left.className = 'topbar__side'
  if (isApp) {
    left.append(button('2B05', 'Back', navigateHome))
    const title = document.createElement('div')
    title.className = 'topbar__title'
    if (app) {
      const icon = document.createElement('gf-icon')
      icon.setAttribute('codepoint', app.icon)
      icon.setAttribute('size', '20px')
      title.append(icon)
    }
    const name = document.createElement('span')
    name.textContent = app?.name ?? 'App'
    title.append(name)
    left.append(title)
  } else {
    const brand = document.createElement('div')
    brand.className = 'topbar__brand'
    brand.textContent = 'GFCode'
    const meta = document.createElement('span')
    meta.className = 'topbar__meta gf-label'
    meta.textContent = `${apps.length} apps`
    const totalBadge = document.createElement('span')
    totalBadge.className = 'topbar__badge'
    totalBadge.hidden = true
    brand.append(meta, totalBadge)
    left.append(brand)
  }

  const right = document.createElement('div')
  right.className = 'topbar__side'

  const connection = document.createElement('span')
  connection.className = 'conn'
  connection.textContent = 'Offline'
  connection.hidden = online
  right.append(connection)

  const palette = button('1F50D', 'Command palette', () => openCommands())
  const shortcut = document.createElement('span')
  shortcut.className = 'topbar__kbd'
  shortcut.textContent = '⌘K'
  palette.append(shortcut)
  right.append(palette)

  if (!isApp) {
    const activity = button('1F514', 'Activity', () => navigate(ACTIVITY_ROUTE))
    const pending = scheduler.pendingCount
    if (pending > 0) {
      const count = document.createElement('span')
      count.className = 'topbar__count'
      count.textContent = String(pending)
      activity.append(count)
    }
    const settings = button('2699', 'Settings', () => navigate(SETTINGS_ROUTE))
    right.append(activity, settings)
  }

  right.append(buildProfileMenu(!isApp))
  topbar.append(left, right)
}

function buildProfileMenu(enabled: boolean): HTMLElement {
  const menu = document.createElement('gf-menu')
  // Profile switcher is only available from the home shell (not inside an app).
  const trigger = document.createElement('button')
  trigger.className = 'profile-trigger'
  trigger.type = 'button'
  trigger.setAttribute('aria-label', 'Profiles')
  trigger.slot = 'trigger'
  trigger.disabled = !enabled
  const avatar = document.createElement('gf-avatar')
  avatar.setAttribute('codepoint', profile.avatar)
  avatar.setAttribute('accent', profile.accent)
  avatar.setAttribute('size', '30px')
  trigger.append(avatar)
  const name = document.createElement('span')
  name.className = 'profile-trigger__name'
  name.textContent = profile.name
  trigger.append(name)

  const panel = document.createElement('div')
  panel.slot = 'panel'
  for (const p of profileCache) {
    const item = document.createElement('button')
    item.type = 'button'
    item.setAttribute('data-menu-item', '')
    item.textContent = p.id === profile.id ? `● ${p.name}` : `○ ${p.name}`
    item.addEventListener('click', () => void switchProfile(p.id))
    panel.append(item)
  }
  const manage = document.createElement('button')
  manage.type = 'button'
  manage.setAttribute('data-menu-item', '')
  manage.textContent = 'Manage profiles…'
  manage.addEventListener('click', () => navigate(PROFILES_ROUTE))
  panel.append(manage)

  menu.append(trigger, panel)
  return menu
}

let profileCache: Profile[] = []

async function refreshProfileCache(): Promise<void> {
  profileCache = await listProfiles()
}

async function switchProfile(id: string): Promise<void> {
  if (id === profile.id) return
  setCurrentId(id)
  profile = (await listProfiles()).find((p) => p.id === id)!
  applyTheme(profile.themeMode, profile.accent)
  appHost?.notifyProfile()
  void scheduler.load(profile.id)
  renderTopbar()
  renderRoute()
}

/* ------------------------------- routes ------------------------------- */

function renderRoute(): void {
  const route = currentRoute()
  renderTopbar()
  renderNav()

  if (route.startsWith(APP_ROUTE_PREFIX)) {
    const id = route.slice(APP_ROUTE_PREFIX.length)
    const app = getApp(id)
    if (!app) {
      navigateHome()
      return
    }
    view.hidden = true
    hostContainer.hidden = false
    openApp(app)
    return
  }

  hostContainer.hidden = true
  view.hidden = false
  appHost?.hide()

  if (route === SETTINGS_ROUTE) {
    view.innerHTML = ''
    view.append(
      renderSettings({
        profile,
        onChangeTheme: setTheme,
        onChangeAccent: setAccent,
        onImported: () => {
          void (async () => {
            await refreshProfileCache()
            profile = await ensureDefaultProfile()
            applyTheme(profile.themeMode, profile.accent)
            renderRoute()
          })()
        },
      }),
    )
  } else if (route === PROFILES_ROUTE) {
    void renderProfilesView()
  } else if (route === ACTIVITY_ROUTE) {
    void renderActivityView()
  } else {
    renderHome()
  }
}

async function renderActivityView(): Promise<void> {
  view.innerHTML = ''
  view.append(await renderActivity({ onChanged: () => void renderActivityView() }))
}

function renderHome(): void {
  view.innerHTML = ''
  view.append(
    createLauncher({
      profile,
      onOpen: (id) => navigate(`${APP_ROUTE_PREFIX}${id}`),
      onToggleFavorite: (id) => void handleToggleFavorite(id),
      onReorderFavorites: (ids) => void handleReorder(ids),
      getBadge: (id) => badges.get(id) ?? 0,
    }),
  )
}

async function renderProfilesView(): Promise<void> {
  profileCache = await listProfiles()
  view.innerHTML = ''
  view.append(
    renderProfiles({
      profiles: profileCache,
      currentId: profile.id,
      onSelect: (id) => void switchProfile(id),
      onCreate: (name, avatar, accent) => void handleCreateProfile(name, avatar, accent),
      onDelete: (id) => void handleDeleteProfile(id),
    }),
  )
}

async function handleToggleFavorite(id: string): Promise<void> {
  await toggleFavorite(id)
  profile = (await listProfiles()).find((p) => p.id === profile.id)!
  renderHome()
}

async function handleReorder(ids: string[]): Promise<void> {
  await setFavorites(ids)
  profile = (await listProfiles()).find((p) => p.id === profile.id)!
  renderHome()
}

async function handleCreateProfile(name: string, avatar: string, accent: string): Promise<void> {
  await createProfile({ name, avatar, accent })
  await refreshProfileCache()
  toast(`Profile “${name}” created`, { variant: 'ok' })
  void renderProfilesView()
}

async function handleDeleteProfile(id: string): Promise<void> {
  const ok = await openConfirm('Delete this profile? All its app data will be lost.', {
    title: 'Delete profile',
    danger: true,
  })
  if (!ok) return
  const backup = await openConfirm('Download a backup of this profile before deleting?', {
    title: 'Backup',
    okLabel: 'Export & delete',
  })
  if (backup) {
    const file = await exportProfile(id)
    downloadBackup(file, `gfcode-profile-${id.slice(0, 8)}.json`)
    toast('Backup exported', { variant: 'ok' })
  }
  await deleteProfile(id)
  await refreshProfileCache()
  if (profile.id === id) {
    profile = await ensureDefaultProfile()
    applyTheme(profile.themeMode, profile.accent)
  }
  toast('Profile deleted', { variant: 'danger' })
  renderTopbar()
  void renderProfilesView()
}

/* ------------------------------- app host ------------------------------- */

function openApp(app: AppManifest): void {
  if (!appHost) {
    appHost = new AppHost(hostContainer, {
      getTheme: themeState,
      getProfile: profileSummary,
      handlers: bridgeHandlers,
      onError: (appId, error) => console.warn(`[shell] app ${appId} error`, error),
      onRpcError: (appId, error) => console.warn(`[shell] app ${appId} rpc error`, error),
    })
  }
  appHost.mount(app)
  void addRecent(app.id).then(async () => {
    profile = (await listProfiles()).find((p) => p.id === profile.id) ?? profile
  })
}

/* ------------------------------- scheduler ------------------------------- */

function showSystemNotification(item: ScheduleItem): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const notification = new Notification(item.title, {
      body: item.body,
      tag: item.id,
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
      if (item.deepLink) navigate(item.deepLink)
      else if (item.appId && item.appId !== 'shell') navigate(`${APP_ROUTE_PREFIX}${item.appId}`)
    }
  } catch {
    /* Notification API unavailable */
  }
}

function decrementBadge(appId: string): void {
  badges.set(appId, Math.max(0, (badges.get(appId) ?? 1) - 1))
  applyBadges()
  renderTopbar()
}

function showAlarm(item: ScheduleItem): void {
  const alarm = document.createElement('gf-alarm')
  alarm.setAttribute('title', item.title)
  if (item.body) alarm.setAttribute('body', item.body)
  if (item.icon) alarm.setAttribute('icon', item.icon)
  alarm.setAttribute('kind', item.kind)
  if (item.snoozeMs) alarm.setAttribute('snooze-label', `Snooze ${Math.round(item.snoozeMs / 60_000)} min`)
  if (item.deepLink) alarm.setAttribute('open-label', 'Open')

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    stopAlarm()
    alarm.remove()
  }
  const refreshIfActivity = (): void => {
    if (currentRoute() === ACTIVITY_ROUTE) void renderActivityView()
  }

  alarm.addEventListener('gf-dismiss', () => {
    close()
    decrementBadge(item.appId)
    void scheduler.dismiss(item.appId, item.id).then(refreshIfActivity)
  })
  alarm.addEventListener('gf-snooze', () => {
    close()
    decrementBadge(item.appId)
    void scheduler.snooze(item.appId, item.id).then(refreshIfActivity)
  })
  alarm.addEventListener('gf-open', () => {
    close()
    decrementBadge(item.appId)
    void scheduler.dismiss(item.appId, item.id)
    navigate(item.deepLink ?? `${APP_ROUTE_PREFIX}${item.appId}`)
  })

  document.body.append(alarm)
  alarm.open()
}

function presentFired(item: ScheduleItem): void {
  if (appHost?.appId === item.appId) appHost.notifyScheduled(item)
  badges.set(item.appId, (badges.get(item.appId) ?? 0) + 1)
  applyBadges()

  if (item.sound) playAlarm()
  if (item.kind === 'notification') {
    toast(item.body ? `${item.title} — ${item.body}` : item.title, { variant: 'default' })
  } else {
    showAlarm(item)
  }
  showSystemNotification(item)
  if (currentRoute() === ACTIVITY_ROUTE) void renderActivityView()
  renderTopbar()
}

const bridgeHandlers: Partial<Record<BridgeMethod, (params: unknown) => unknown | Promise<unknown>>> = {
  'ui.toast': (params) => {
    const p = params as { message: string; variant?: 'default' | 'ok' | 'danger'; duration?: number }
    toast(p.message, { variant: p.variant, duration: p.duration })
    return true
  },
  'ui.confirm': async (params) => {
    const p = params as { message: string; title?: string; okLabel?: string; danger?: boolean }
    return { ok: await openConfirm(p.message, p) }
  },
  'ui.modal': (params) => {
    const p = params as { title: string; content: string }
    openModal(p.title, p.content)
    return true
  },
  'ui.badge': (params) => {
    const p = params as { count: number }
    const id = appHost?.appId
    if (id) badges.set(id, Math.max(0, Math.floor(p.count)))
    applyBadges()
    return true
  },
  'shell.navigate': (params) => {
    const p = params as { target: string }
    navigate(p.target.startsWith('#') ? p.target : `${APP_ROUTE_PREFIX}${p.target.replace(/^\/?app\//, '')}`)
    return true
  },
  'shell.home': () => {
    navigateHome()
    return true
  },
  'theme.set': (params) => {
    const p = params as { mode: ThemeMode }
    setTheme(p.mode)
    return true
  },
  'scheduler.schedule': (params) => {
    const appId = appHost?.appId
    if (!appId) throw Object.assign(new Error('No active app'), { code: 'E_SCHEDULE' })
    return scheduler.schedule(appId, params as ScheduleDraft)
  },
  'scheduler.cancel': (params) => {
    const appId = appHost?.appId
    if (!appId) return false
    return scheduler.cancel(appId, (params as { id: string }).id)
  },
  'scheduler.snooze': (params) => {
    const appId = appHost?.appId
    if (!appId) return false
    const p = params as { id: string; ms?: number }
    return scheduler.snooze(appId, p.id, p.ms)
  },
  'scheduler.list': () => {
    const appId = appHost?.appId
    return appId ? scheduler.list(appId) : Promise.resolve([])
  },
  'scheduler.clear': async () => {
    const appId = appHost?.appId
    if (!appId) return true
    await scheduler.clear(appId)
    return true
  },
}

function openModal(title: string, content: string): void {
  const modal = document.createElement('gf-modal')
  modal.setAttribute('title', title)
  const body = document.createElement('p')
  body.textContent = content
  const footer = document.createElement('gf-button')
  footer.setAttribute('slot', 'footer')
  footer.setAttribute('variant', 'primary')
  footer.textContent = 'Close'
  footer.addEventListener('click', () => {
    modal.close()
    modal.remove()
  })
  modal.addEventListener('gf-close', () => modal.remove())
  modal.append(body, footer)
  document.body.append(modal)
  modal.open()
}

function openConfirm(
  message: string,
  options: { title?: string; okLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement('gf-modal')
    modal.setAttribute('title', options.title ?? 'Confirm')
    const body = document.createElement('p')
    body.textContent = message

    const cancel = document.createElement('gf-button')
    cancel.setAttribute('slot', 'footer')
    cancel.textContent = 'Cancel'

    const ok = document.createElement('gf-button')
    ok.setAttribute('slot', 'footer')
    ok.setAttribute('variant', options.danger ? 'danger' : 'primary')
    ok.textContent = options.okLabel ?? 'Confirm'

    const finish = (value: boolean) => {
      modal.close()
      modal.remove()
      resolve(value)
    }
    cancel.addEventListener('click', () => finish(false))
    ok.addEventListener('click', () => finish(true))
    modal.addEventListener('gf-close', () => {
      modal.remove()
      resolve(false)
    })

    modal.append(body, cancel, ok)
    document.body.append(modal)
    modal.open()
  })
}

/* ------------------------------- chrome ------------------------------- */

function renderNav(): void {
  const route = currentRoute()
  const entries: { label: string; icon: string; hash: string }[] = [
    { label: 'Home', icon: '1F3E0', hash: HOME_ROUTE },
    { label: 'Activity', icon: '1F514', hash: ACTIVITY_ROUTE },
    { label: 'Profiles', icon: '1F464', hash: PROFILES_ROUTE },
    { label: 'Settings', icon: '2699', hash: SETTINGS_ROUTE },
  ]
  nav.innerHTML = ''
  for (const entry of entries) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'nav__item'
    if (route === entry.hash) button.classList.add('is-active')
    const icon = document.createElement('gf-icon')
    icon.setAttribute('codepoint', entry.icon)
    icon.setAttribute('size', '22px')
    const label = document.createElement('span')
    label.textContent = entry.label
    button.append(icon, label)
    button.addEventListener('click', () => navigate(entry.hash))
    nav.append(button)
  }
}

function openCommands(): void {
  const commands: Command[] = apps.map((app) => ({
    id: `app:${app.id}`,
    label: app.name,
    hint: app.category,
    icon: app.icon,
    run: () => navigate(`${APP_ROUTE_PREFIX}${app.id}`),
  }))
  commands.push(
    { id: 'go:home', label: 'Go home', hint: 'navigation', icon: '1F3E0', run: navigateHome },
    {
      id: 'go:activity',
      label: 'Open activity',
      hint: 'navigation',
      icon: '1F514',
      run: () => navigate(ACTIVITY_ROUTE),
    },
    {
      id: 'go:settings',
      label: 'Open settings',
      hint: 'navigation',
      icon: '2699',
      run: () => navigate(SETTINGS_ROUTE),
    },
    {
      id: 'go:profiles',
      label: 'Manage profiles',
      hint: 'navigation',
      icon: '1F464',
      run: () => navigate(PROFILES_ROUTE),
    },
    {
      id: 'theme:toggle',
      label: 'Toggle light / dark',
      hint: 'appearance',
      icon: '1F313',
      run: () => setTheme(resolveTheme(profile.themeMode) === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'theme:system',
      label: 'Follow system theme',
      hint: 'appearance',
      icon: '1F5A5',
      run: () => setTheme('system'),
    },
  )
  for (const p of profileCache) {
    if (p.id === profile.id) continue
    commands.push({
      id: `profile:${p.id}`,
      label: `Switch to ${p.name}`,
      hint: 'profile',
      icon: p.avatar,
      run: () => void switchProfile(p.id),
    })
  }
  openCommandPalette(commands)
}

/* ------------------------------- boot ------------------------------- */

async function boot(): Promise<void> {
  // Pre-create the object stores for every known app so apps never need to
  // trigger a version upgrade (which would be blocked by the shell's connection).
  await openDB(apps.map((app) => `app_${app.id}`))

  profile = await ensureDefaultProfile()
  await refreshProfileCache()

  const fallback = getThemeFallback()
  if (!profile.themeMode) profile.themeMode = fallback
  applyTheme(profile.themeMode, profile.accent)

  installAudioUnlock()
  scheduler.onFired(presentFired)
  scheduler.start()
  await scheduler.load(profile.id)
  // Catch up on entries that came due while the tab was backgrounded asleep.
  window.addEventListener('focus', () => void scheduler.checkDue())
  window.addEventListener('pageshow', () => void scheduler.checkDue())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void scheduler.checkDue()
  })

  watchSystemTheme(() => {
    if (profile.themeMode === 'system') applyTheme('system', profile.accent)
  })

  if (!window.location.hash) window.location.hash = HOME_ROUTE
  window.addEventListener('hashchange', renderRoute)

  window.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      openCommands()
    }
  })

  await requestPersistentStorage()
  setupPWA({
    onUpdateAvailable: () =>
      openConfirm('A new version is available. Update now?', { title: 'Update', okLabel: 'Update' }),
    onOfflineReady: () => toast('Ready to work offline', { variant: 'ok' }),
  })
  window.addEventListener('online', () => setConnection(true))
  window.addEventListener('offline', () => setConnection(false))
  setConnection(navigator.onLine)
  renderRoute()
}

async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* ignore */
  }
}

void boot()
