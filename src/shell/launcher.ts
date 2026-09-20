import type { AppManifest, Profile } from '../core/types'
import { apps as allApps, categories } from '../core/registry'

export interface LauncherOptions {
  profile: Profile
  onOpen: (id: string) => void
  onToggleFavorite: (id: string) => void
  onReorderFavorites: (ids: string[]) => void
  getBadge?: (id: string) => number
}

function appCard(app: AppManifest, options: LauncherOptions, favorite: boolean): HTMLElement {
  const card = document.createElement('div')
  card.className = 'app-card'
  card.dataset.appId = app.id
  card.tabIndex = 0

  const icon = document.createElement('gf-icon')
  icon.setAttribute('codepoint', app.icon)
  icon.setAttribute('size', '34px')
  icon.className = 'app-card__icon'

  const name = document.createElement('div')
  name.className = 'app-card__name'
  name.textContent = app.name

  const category = document.createElement('div')
  category.className = 'app-card__category'
  category.textContent = app.category ?? 'app'

  const body = document.createElement('div')
  body.className = 'app-card__body'
  body.append(icon, name, category)

  const badgeCount = options.getBadge?.(app.id) ?? 0
  const badge = document.createElement('span')
  badge.className = 'app-card__badge'
  badge.textContent = String(badgeCount)
  badge.hidden = badgeCount === 0
  badge.setAttribute('aria-label', `${badgeCount} notifications`)

  const actions = document.createElement('div')
  actions.className = 'app-card__actions'

  const fav = document.createElement('button')
  fav.className = 'app-card__fav'
  fav.type = 'button'
  fav.title = favorite ? 'Remove favorite' : 'Add favorite'
  fav.setAttribute('aria-pressed', String(favorite))
  fav.textContent = favorite ? '★' : '☆'
  fav.addEventListener('click', (event) => {
    event.stopPropagation()
    options.onToggleFavorite(app.id)
  })

  const open = document.createElement('gf-button')
  open.setAttribute('size', 'sm')
  open.setAttribute('variant', 'primary')
  open.textContent = 'Open'
  open.addEventListener('click', (event) => {
    event.stopPropagation()
    options.onOpen(app.id)
  })

  actions.append(fav, open)
  card.append(body, badge, actions)

  const activate = () => options.onOpen(app.id)
  card.addEventListener('dblclick', activate)
  card.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') activate()
  })

  return card
}

export function createLauncher(options: LauncherOptions): HTMLElement {
  const root = document.createElement('div')
  root.className = 'launcher'

  const search = document.createElement('gf-input')
  search.setAttribute('placeholder', 'Search apps…')

  const grid = document.createElement('div')
  grid.className = 'launcher__results'

  const query = () => (search as unknown as { value: string }).value.trim().toLowerCase()
  let activeCategory: string | null = null

  function matches(app: AppManifest): boolean {
    const q = query()
    const inCategory = !activeCategory || app.category === activeCategory
    if (!q) return inCategory
    const haystack = `${app.name} ${app.description ?? ''} ${app.category ?? ''}`.toLowerCase()
    return inCategory && haystack.includes(q)
  }

  function render(): void {
    grid.innerHTML = ''
    renderChips()
    const profile = options.profile
    const favorites = profile.favorites
    const recent = profile.recent.map((r) => r.appId)

    const visible = allApps.filter(matches)
    const hasQuery = query().length > 0 || activeCategory !== null

    if (!hasQuery) {
      const favApps = favorites.map((id) => allApps.find((a) => a.id === id)).filter(Boolean) as AppManifest[]
      if (favApps.length) grid.append(section('Favorites', favApps, true))
      const recentApps = recent.map((id) => allApps.find((a) => a.id === id)).filter(Boolean) as AppManifest[]
      if (recentApps.length) grid.append(section('Recently used', recentApps, false))
    }

    const gridEl = document.createElement('div')
    gridEl.className = 'app-grid'
    if (visible.length === 0) {
      const empty = document.createElement('gf-empty-state')
      empty.setAttribute('icon', '1F50D')
      empty.setAttribute('title', 'No apps found')
      empty.setAttribute('text', 'Try a different search term or category.')
      gridEl.append(empty)
    } else {
      for (const app of visible) gridEl.append(appCard(app, options, favorites.includes(app.id)))
    }
    grid.append(section(hasQuery ? 'Results' : 'All apps', null, false, gridEl))
  }

  function section(title: string, list: AppManifest[] | null, draggable: boolean, custom?: HTMLElement): HTMLElement {
    const wrap = document.createElement('section')
    wrap.className = 'launcher__section'
    const heading = document.createElement('h2')
    heading.className = 'launcher__heading gf-label'
    heading.textContent = title
    wrap.append(heading)

    if (custom) {
      wrap.append(custom)
      return wrap
    }

    const gridEl = document.createElement('div')
    gridEl.className = 'app-grid'
    for (const app of list ?? []) {
      const card = appCard(app, options, options.profile.favorites.includes(app.id))
      if (draggable) {
        card.draggable = true
        card.addEventListener('dragstart', (event) => {
          (event as DragEvent).dataTransfer?.setData('text/plain', app.id)
          card.classList.add('is-dragging')
        })
        card.addEventListener('dragend', () => card.classList.remove('is-dragging'))
        card.addEventListener('dragover', (event) => event.preventDefault())
        card.addEventListener('drop', (event) => {
          event.preventDefault()
          const sourceId = (event as DragEvent).dataTransfer?.getData('text/plain')
          if (!sourceId || sourceId === app.id) return
          const order = [...options.profile.favorites]
          const from = order.indexOf(sourceId)
          const to = order.indexOf(app.id)
          if (from < 0 || to < 0) return
          order.splice(from, 1)
          order.splice(to, 0, sourceId)
          options.onReorderFavorites(order)
        })
      }
      gridEl.append(card)
    }
    wrap.append(gridEl)
    return wrap
  }

  const chips = document.createElement('div')
  chips.className = 'launcher__chips'
  const makeChip = (label: string, value: string | null) => {
    const chip = document.createElement('gf-chip')
    chip.textContent = label
    if (activeCategory === value) chip.setAttribute('active', '')
    chip.addEventListener('gf-chip-toggle', () => {
      activeCategory = activeCategory === value ? null : value
      render()
    })
    return chip
  }
  function renderChips(): void {
    chips.innerHTML = ''
    chips.append(makeChip('All', null))
    for (const category of categories()) chips.append(makeChip(category, category))
  }

  search.addEventListener('gf-input', () => render())

  const controls = document.createElement('div')
  controls.className = 'launcher__controls'
  controls.append(search, chips)

  root.append(controls, grid)
  render()
  return root
}
