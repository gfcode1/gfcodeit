import type { Profile, ThemeMode } from '../core/types'
import { ACCENTS } from '../core/profile'
import { apps } from '../core/registry'
import { downloadBackup, exportAll, exportApp, exportProfile, importBackup, readBackupFile } from '../core/backup'
import { toast } from '../ui/overlay'

export interface SettingsOptions {
  profile: Profile
  onChangeTheme: (mode: ThemeMode) => void
  onChangeAccent: (accent: string) => void
  onImported: () => void
}

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']

function card(title: string): { card: HTMLElement; body: HTMLElement } {
  const el = document.createElement('gf-card')
  const heading = document.createElement('h2')
  heading.className = 'gf-label'
  heading.textContent = title
  const body = document.createElement('div')
  body.className = 'settings__body'
  el.append(heading, body)
  return { card: el, body }
}

export function renderSettings(options: SettingsOptions): HTMLElement {
  const root = document.createElement('div')
  root.className = 'view'

  const header = document.createElement('gf-page-header')
  header.setAttribute('title', 'Settings')
  header.setAttribute('subtitle', 'Appearance, storage and credits.')

  // Appearance
  const appearance = card('Appearance')
  const themeRow = document.createElement('div')
  themeRow.className = 'row'
  for (const mode of THEME_MODES) {
    const chip = document.createElement('gf-chip')
    chip.textContent = mode
    if (options.profile.themeMode === mode) chip.setAttribute('active', '')
    chip.addEventListener('gf-chip-toggle', () => options.onChangeTheme(mode))
    themeRow.append(chip)
  }

  const accentRow = document.createElement('div')
  accentRow.className = 'swatches'
  for (const accent of ACCENTS) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'swatch'
    swatch.style.background = accent
    swatch.title = accent
    if (options.profile.accent.toUpperCase() === accent.toUpperCase()) swatch.classList.add('is-active')
    swatch.addEventListener('click', () => options.onChangeAccent(accent))
    accentRow.append(swatch)
  }

  appearance.body.append(labelRow('Theme', themeRow), labelRow('Accent', accentRow))

  // Storage
  const storage = card('Storage')
  const storageInfo = document.createElement('div')
  storageInfo.className = 'storage-info'
  storageInfo.textContent = 'Checking…'
  storage.body.append(storageInfo)
  void fillStorage(storageInfo)

  // Credits
  const credits = card('Credits')
  const creditsText = document.createElement('p')
  creditsText.className = 'muted'
  creditsText.innerHTML =
    'Icons by <a href="https://openmoji.org/" target="_blank" rel="noreferrer">OpenMoji</a> (CC BY-SA 4.0). ' +
    'Framework: GFCode.'
  credits.body.append(creditsText)

  root.append(
    header,
    appearance.card,
    renderNotificationsCard(),
    renderDataCard(options),
    storage.card,
    credits.card,
  )
  return root
}

function renderNotificationsCard(): HTMLElement {
  const { card: el, body } = card('Notifications')
  const supported = 'Notification' in window
  const status = document.createElement('p')
  status.className = 'muted'

  const enable = document.createElement('gf-button')
  enable.setAttribute('size', 'sm')
  enable.textContent = 'Enable notifications'

  const update = (): void => {
    if (!supported) {
      status.textContent = 'System notifications are not supported by this browser.'
      enable.hidden = true
      return
    }
    const permission = Notification.permission
    status.textContent =
      permission === 'granted'
        ? 'System notifications are enabled.'
        : permission === 'denied'
          ? 'System notifications are blocked in your browser settings.'
          : 'System notifications are not enabled yet.'
    enable.hidden = permission === 'granted' || permission === 'denied'
  }

  enable.addEventListener('click', async () => {
    if (!supported) return
    try {
      await Notification.requestPermission()
    } catch {
      /* ignore */
    }
    update()
  })

  const note = document.createElement('p')
  note.className = 'muted'
  note.textContent =
    'Timers, alarms and reminders fire while GFCode is open in a tab. Alarm sound starts after your first interaction.'

  body.append(enable, status, note)
  update()
  return el
}

function renderDataCard(options: SettingsOptions): HTMLElement {
  const { card: el, body } = card('Data')

  const exportAllButton = document.createElement('gf-button')
  exportAllButton.setAttribute('variant', 'primary')
  exportAllButton.textContent = 'Export all data'
  exportAllButton.addEventListener('click', async () => {
    const file = await exportAll()
    downloadBackup(file, `gfcode-backup-${new Date().toISOString().slice(0, 10)}.json`)
    toast('Backup exported', { variant: 'ok' })
  })

  const importInput = document.createElement('input')
  importInput.type = 'file'
  importInput.accept = 'application/json,.json'
  importInput.hidden = true
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]
    if (!file) return
    try {
      const backup = await readBackupFile(file)
      await importBackup(backup, 'merge')
      toast('Backup imported', { variant: 'ok' })
      options.onImported()
    } catch (error) {
      toast(`Import failed: ${(error as Error).message}`, { variant: 'danger' })
    } finally {
      importInput.value = ''
    }
  })

  const importButton = document.createElement('gf-button')
  importButton.textContent = 'Import data (merge)'
  importButton.addEventListener('click', () => importInput.click())

  const actions = document.createElement('div')
  actions.className = 'row'
  actions.append(exportAllButton, importButton, importInput)

  const perApp = document.createElement('div')
  perApp.className = 'row'
  const label = document.createElement('span')
  label.className = 'gf-label'
  label.textContent = 'Export per app'
  perApp.append(label)
  for (const app of apps) {
    const button = document.createElement('gf-button')
    button.setAttribute('size', 'sm')
    button.textContent = app.name
    button.addEventListener('click', async () => {
      const file = await exportApp(app.id, options.profile.id)
      downloadBackup(file, `gfcode-${app.id}-${options.profile.id.slice(0, 8)}.json`)
      toast(`Exported ${app.name}`, { variant: 'ok' })
    })
    perApp.append(button)
  }

  body.append(actions, perApp)
  return el
}

function labelRow(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div')
  row.className = 'field-row'
  const span = document.createElement('span')
  span.className = 'gf-label'
  span.textContent = label
  row.append(span, control)
  return row
}

async function fillStorage(target: HTMLElement): Promise<void> {
  const parts: string[] = []
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false
    const estimate = (await navigator.storage?.estimate?.()) ?? {}
    const used = estimate.usage ? `${(estimate.usage / 1024 / 1024).toFixed(2)} MB` : 'unknown'
    const quota = estimate.quota ? `${(estimate.quota / 1024 / 1024).toFixed(0)} MB` : 'unknown'
    parts.push(`Persistent: ${persisted ? 'yes' : 'no'}`, `Used: ${used}`, `Quota: ${quota}`)
    target.textContent = parts.join('  ·  ')
    if (!persisted && navigator.storage?.persist) {
      const status = document.createElement('span')
      const button = document.createElement('gf-button')
      button.setAttribute('size', 'sm')
      button.textContent = 'Request persistence'
      button.addEventListener('click', async () => {
        const granted = await navigator.storage.persist()
        status.textContent = `  ·  Requested: ${granted ? 'granted' : 'denied'}`
        button.remove()
      })
      target.append(document.createElement('br'), button, status)
    }
  } catch {
    target.textContent = 'Storage API unavailable.'
  }
}

export interface ProfilesOptions {
  profiles: Profile[]
  currentId: string
  onSelect: (id: string) => void
  onCreate: (name: string, avatar: string, accent: string) => void
  onDelete: (id: string) => void
}

export function renderProfiles(options: ProfilesOptions): HTMLElement {
  const root = document.createElement('div')
  root.className = 'view'

  const header = document.createElement('gf-page-header')
  header.setAttribute('title', 'Profiles')
  header.setAttribute('subtitle', 'Each profile keeps its own apps data.')

  const list = document.createElement('div')
  list.className = 'profile-list'
  for (const profile of options.profiles) {
    const row = document.createElement('div')
    row.className = 'profile-row'
    if (profile.id === options.currentId) row.classList.add('is-current')

    const avatar = document.createElement('gf-avatar')
    avatar.setAttribute('codepoint', profile.avatar)
    avatar.setAttribute('accent', profile.accent)

    const meta = document.createElement('div')
    meta.className = 'profile-row__meta'
    const name = document.createElement('strong')
    name.textContent = profile.name
    const sub = document.createElement('span')
    sub.className = 'muted'
    sub.textContent = profile.isDefault ? 'default profile' : 'profile'
    meta.append(name, sub)

    const actions = document.createElement('div')
    actions.className = 'profile-row__actions'

    const exportButton = document.createElement('gf-button')
    exportButton.setAttribute('size', 'sm')
    exportButton.textContent = 'Export'
    exportButton.addEventListener('click', async () => {
      const file = await exportProfile(profile.id)
      downloadBackup(file, `gfcode-profile-${profile.id.slice(0, 8)}.json`)
      toast(`Exported “${profile.name}”`, { variant: 'ok' })
    })
    actions.append(exportButton)

    if (profile.id !== options.currentId) {
      const use = document.createElement('gf-button')
      use.setAttribute('size', 'sm')
      use.textContent = 'Switch'
      use.addEventListener('click', () => options.onSelect(profile.id))
      actions.append(use)
    } else {
      const badge = document.createElement('gf-badge')
      badge.setAttribute('variant', 'accent')
      badge.textContent = 'current'
      actions.append(badge)
    }
    if (!profile.isDefault) {
      const del = document.createElement('gf-button')
      del.setAttribute('size', 'sm')
      del.setAttribute('variant', 'danger')
      del.textContent = 'Delete'
      del.addEventListener('click', () => options.onDelete(profile.id))
      actions.append(del)
    }

    row.append(avatar, meta, actions)
    list.append(row)
  }

  root.append(header, list, createProfileForm(options))

  const note = document.createElement('p')
  note.className = 'muted'
  note.textContent = 'Switch profile from the home launcher. Data is isolated per profile.'
  root.append(note)

  return root
}

function createProfileForm(options: ProfilesOptions): HTMLElement {
  const wrap = document.createElement('gf-card')
  const heading = document.createElement('h2')
  heading.className = 'gf-label'
  heading.textContent = 'New profile'

  const name = document.createElement('gf-input')
  name.setAttribute('placeholder', 'Profile name')

  const avatar = document.createElement('gf-input')
  avatar.setAttribute('placeholder', 'Emoji')
  avatar.setAttribute('value', '1F464')

  const pickEmoji = document.createElement('gf-button')
  pickEmoji.setAttribute('size', 'sm')
  pickEmoji.textContent = 'Pick emoji'
  const modal = document.createElement('gf-modal')
  modal.setAttribute('title', 'Choose an emoji')
  const picker = document.createElement('gf-emoji-picker')
  modal.append(picker)
  pickEmoji.addEventListener('click', () => modal.open())
  picker.addEventListener('gf-pick', (event) => {
    avatar.setAttribute('value', (event as CustomEvent<{ hexcode: string }>).detail.hexcode)
    modal.close()
  })

  const accent = document.createElement('div')
  accent.className = 'swatches'
  let selected: string = ACCENTS[0]
  for (const color of ACCENTS) {
    const swatch = document.createElement('button')
    swatch.type = 'button'
    swatch.className = 'swatch'
    swatch.style.background = color
    if (color === selected) swatch.classList.add('is-active')
    swatch.addEventListener('click', () => {
      selected = color
      for (const child of accent.children) child.classList.remove('is-active')
      swatch.classList.add('is-active')
    })
    accent.append(swatch)
  }

  const create = document.createElement('gf-button')
  create.setAttribute('variant', 'primary')
  create.textContent = 'Create profile'
  create.addEventListener('click', () => {
    const value = (name as unknown as { value: string }).value.trim()
    if (!value) return
    options.onCreate(value, (avatar as unknown as { value: string }).value || '1F464', selected)
    ;(name as unknown as { value: string }).value = ''
  })

  wrap.append(heading, name, avatar, pickEmoji, accent, create, modal)
  return wrap
}
