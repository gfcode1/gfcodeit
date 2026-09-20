import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  fetchCountries,
  fetchStations,
  fetchTags,
  registerClick,
  voteStation,
  type Station,
  type StationOrder,
} from './api'
import { RadioPlayer, type PlayerState } from './player'

const FAVORITES_KEY = 'favorites'
const RECENT_KEY = 'recent'
const VOLUME_KEY = 'volume'
const LAST_KEY = 'lastStation'
const VOTES_KEY = 'votes'

const SEARCH_DEBOUNCE_MS = 350
const RECENT_LIMIT = 20

type View = 'top' | 'search' | 'favorites' | 'recent'

const VIEWS: { value: View; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'search', label: 'Search' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'recent', label: 'Recent' },
]

const ORDERS: { value: StationOrder; label: string }[] = [
  { value: 'clickcount', label: 'Most played' },
  { value: 'votes', label: 'Most voted' },
  { value: 'name', label: 'Name A–Z' },
]

async function bootstrapRuntime(): Promise<GFApi> {
  const base = import.meta.env.BASE_URL
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${base}framework/v1/tokens.css`
  document.head.append(link)

  await import(/* @vite-ignore */ `${base}framework/v1/gf-runtime.js`)
  return window.GF_READY
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  return node
}

function option(value: string, label: string): HTMLOptionElement {
  const node = document.createElement('option')
  node.value = value
  node.textContent = label
  return node
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  let profile = await gf.profile.getCurrent()
  let favorites = (await gf.storage.get<Station[]>(FAVORITES_KEY)) ?? []
  let recent = (await gf.storage.get<Station[]>(RECENT_KEY)) ?? []
  let voted = (await gf.storage.get<string[]>(VOTES_KEY)) ?? []
  let volumeLevel = (await gf.storage.get<number>(VOLUME_KEY)) ?? 0.8
  const lastStation = await gf.storage.get<Station>(LAST_KEY)

  let topStations: Station[] = []
  let searchStations: Station[] = []
  let view: View = 'top'
  let query = ''
  let tag = ''
  let country = ''
  let order: StationOrder = 'clickcount'
  let loading = true
  let error: string | null = null
  let searchTimer: number | null = null
  let sleepTimer: number | null = null
  let searchController: AbortController | null = null

  // ---- shell --------------------------------------------------------------
  const header = el('gf-page-header')
  header.setAttribute('title', 'Radio')
  header.setAttribute('subtitle', `${profile.name} · loading stations…`)

  const toolbar = el('div', 'radio-toolbar')
  const search = el('gf-input')
  search.setAttribute('placeholder', 'Search stations by name…')
  search.className = 'search'

  let tagSelect: HTMLElement = el('gf-select')
  tagSelect.className = 'filter tag-select'
  tagSelect.append(option('', 'All tags'))

  let countrySelect: HTMLElement = el('gf-select')
  countrySelect.className = 'filter country-select'
  countrySelect.append(option('', 'All countries'))

  const orderSelect = el('gf-select')
  orderSelect.className = 'filter order-select'
  for (const item of ORDERS) orderSelect.append(option(item.value, item.label))
  orderSelect.setAttribute('value', order)

  toolbar.append(search, tagSelect, countrySelect, orderSelect)

  const viewBar = el('div', 'view-bar')
  const content = el('div', 'station-grid')

  const nowPlaying = el('div', 'now-playing')
  nowPlaying.hidden = true
  const npMain = el('div', 'now-playing__main')
  const npArt = el('div', 'now-playing__art')
  const npInfo = el('div', 'now-playing__info')
  const npTitle = el('div', 'now-playing__title')
  const npMeta = el('div', 'now-playing__meta')
  npInfo.append(npTitle, npMeta)
  const npButtons = el('div', 'now-playing__buttons')
  const playButton = el('gf-button')
  playButton.setAttribute('variant', 'primary')
  playButton.setAttribute('size', 'sm')
  playButton.textContent = 'Play'
  const prevButton = el('gf-button')
  prevButton.setAttribute('size', 'sm')
  prevButton.textContent = 'Prev'
  const nextButton = el('gf-button')
  nextButton.setAttribute('size', 'sm')
  nextButton.textContent = 'Next'
  const voteButton = el('gf-button')
  voteButton.setAttribute('size', 'sm')
  voteButton.textContent = 'Vote'
  npButtons.append(playButton, prevButton, nextButton, voteButton)
  npMain.append(npArt, npInfo, npButtons)
  const npFoot = el('div', 'now-playing__foot')
  const volumeSlider = el('gf-slider')
  volumeSlider.className = 'now-playing__volume'
  volumeSlider.setAttribute('min', '0')
  volumeSlider.setAttribute('max', '100')
  volumeSlider.setAttribute('value', String(Math.round(volumeLevel * 100)))
  const sleepSelect = el('gf-select')
  sleepSelect.className = 'now-playing__timer'
  for (const minutes of ['0', '15', '30', '60']) {
    sleepSelect.append(option(minutes, minutes === '0' ? 'Sleep: off' : `Sleep: ${minutes}m`))
  }
  const npCodec = el('span', 'now-playing__codec')
  npFoot.append(volumeSlider, sleepSelect, npCodec)
  nowPlaying.append(npMain, npFoot)

  root.append(header, toolbar, viewBar, content, nowPlaying)

  let lastError: string | null = null
  const player = new RadioPlayer({
    onState: (state) => {
      renderNowPlaying(state)
      if (state.error && state.error !== lastError) gf.ui.toast(state.error, { variant: 'danger' })
      lastError = state.error
    },
    onTrackChange: (direction) => changeStation(direction === 'next' ? 1 : -1),
  })
  player.setVolume(volumeLevel)
  if (lastStation) player.load(lastStation)

  // ---- data ---------------------------------------------------------------
  function currentList(): Station[] {
    if (view === 'top') return topStations
    if (view === 'search') return searchStations
    if (view === 'favorites') return favorites
    return recent
  }

  async function loadTop(): Promise<void> {
    loading = true
    error = null
    renderGrid()
    updateSubtitle()
    try {
      topStations = await fetchStations(gf, { order, limit: 60 })
      loading = false
    } catch (cause) {
      loading = false
      error = (cause as Error).message
    }
    renderGrid()
    updateSubtitle()
  }

  async function runSearch(): Promise<void> {
    searchController?.abort()
    if (!query.trim() && !tag && !country) {
      searchStations = []
      loading = false
      error = null
      renderGrid()
      updateSubtitle()
      return
    }
    const controller = new AbortController()
    searchController = controller
    loading = true
    error = null
    renderGrid()
    updateSubtitle()
    try {
      const result = await fetchStations(gf, {
        name: query.trim(),
        tag,
        country,
        order,
        limit: 60,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      searchStations = result
      loading = false
    } catch (cause) {
      if ((cause as { name?: string } | null)?.name === 'AbortError') return
      loading = false
      error = (cause as Error).message
      gf.ui.toast('Search failed — try again', { variant: 'danger' })
    }
    renderGrid()
    updateSubtitle()
  }

  async function loadFilters(): Promise<void> {
    try {
      const [tags, countries] = await Promise.all([fetchTags(gf), fetchCountries(gf)])
      tagSelect = rebuildSelect(
        tagSelect,
        [option('', 'All tags'), ...tags.slice(0, 120).map((item) => option(item.name, item.name))],
        tag,
        (value) => {
          tag = value
          if (view !== 'search') setView('search')
          else void runSearch()
        },
      )
      countrySelect = rebuildSelect(
        countrySelect,
        [
          option('', 'All countries'),
          ...countries.slice(0, 120).map((item) => option(item.code, item.name)),
        ],
        country,
        (value) => {
          country = value
          if (view !== 'search') setView('search')
          else void runSearch()
        },
      )
    } catch {
      // Filters are optional; the search box still works without them.
    }
  }

  function rebuildSelect(
    node: HTMLElement,
    options: HTMLOptionElement[],
    value: string,
    onSelect: (value: string) => void,
  ): HTMLElement {
    const next = el('gf-select')
    next.className = node.className
    for (const item of options) next.append(item)
    next.setAttribute('value', value)
    next.addEventListener('gf-change', (event) => {
      onSelect((event as CustomEvent<{ value: string }>).detail.value)
    })
    node.replaceWith(next)
    return next
  }

  // ---- actions ------------------------------------------------------------
  async function playStation(station: Station): Promise<void> {
    markRecent(station)
    void gf.storage.set(LAST_KEY, station)
    registerClick(station.uuid)
    void player.play(station)
    renderGrid()
  }

  function markRecent(station: Station): void {
    recent = [station, ...recent.filter((item) => item.uuid !== station.uuid)].slice(0, RECENT_LIMIT)
    void gf.storage.set(RECENT_KEY, recent)
  }

  function toggleFavorite(station: Station): void {
    if (favorites.some((item) => item.uuid === station.uuid)) {
      favorites = favorites.filter((item) => item.uuid !== station.uuid)
    } else {
      favorites = [station, ...favorites]
    }
    void gf.storage.set(FAVORITES_KEY, favorites)
    renderGrid()
    renderNowPlaying(player.state)
  }

  function changeStation(delta: number): void {
    const list = currentList()
    if (list.length === 0) return
    const currentId = player.currentStation?.uuid
    const index = list.findIndex((station) => station.uuid === currentId)
    const next = list[(index + delta + list.length) % list.length] ?? list[0]!
    void playStation(next)
  }

  async function castVote(station: Station): Promise<void> {
    if (voted.includes(station.uuid)) {
      gf.ui.toast('You already voted for this station')
      return
    }
    voteButton.setAttribute('disabled', '')
    const result = await voteStation(station.uuid)
    voteButton.removeAttribute('disabled')
    if (!result.ok) {
      gf.ui.toast(result.message || 'Vote failed', { variant: 'danger' })
      return
    }
    voted = [...voted, station.uuid]
    await gf.storage.set(VOTES_KEY, voted)
    gf.ui.toast(`Voted for ${station.name}`, { variant: 'ok' })
    renderNowPlaying(player.state)
  }

  function setView(next: View): void {
    view = next
    renderViewBar()
    renderGrid()
    updateSubtitle()
  }

  // ---- rendering ----------------------------------------------------------
  function updateSubtitle(): void {
    if (loading) {
      header.setAttribute('subtitle', `${profile.name} · loading…`)
      return
    }
    const count = currentList().length
    header.setAttribute('subtitle', `${profile.name} · ${count} station${count === 1 ? '' : 's'}`)
  }

  function renderViewBar(): void {
    viewBar.innerHTML = ''
    for (const item of VIEWS) {
      const chip = el('gf-chip')
      if (item.value === view) chip.setAttribute('active', '')
      chip.textContent = item.label
      chip.addEventListener('click', () => setView(item.value))
      viewBar.append(chip)
    }
  }

  function renderSkeleton(): void {
    content.innerHTML = ''
    for (let i = 0; i < 8; i += 1) {
      const card = el('div', 'station-card station-card--skeleton')
      const block = el('gf-skeleton')
      block.setAttribute('height', '150px')
      card.append(block)
      content.append(card)
    }
  }

  function renderGridError(message: string): void {
    content.innerHTML = ''
    const empty = el('gf-empty-state')
    empty.setAttribute('icon', '26A0')
    empty.setAttribute('title', 'Could not load stations')
    empty.setAttribute('text', message)
    const retry = el('gf-button')
    retry.setAttribute('variant', 'primary')
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => void (view === 'search' ? runSearch() : loadTop()))
    empty.append(retry)
    content.append(empty)
  }

  function renderGrid(): void {
    if (loading) {
      renderSkeleton()
      return
    }
    if (error) {
      renderGridError(error)
      return
    }
    const list = currentList()
    content.innerHTML = ''
    if (list.length === 0) {
      if (view === 'search') {
        const hint = el('div', 'hint')
        hint.textContent = 'Type a station name or pick a tag or country to start searching.'
        content.append(hint)
        return
      }
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F4E1')
      empty.setAttribute('title', view === 'favorites' ? 'No favorites yet' : 'No recent stations')
      empty.setAttribute(
        'text',
        view === 'favorites'
          ? 'Tap the star on a station to keep it here.'
          : 'Stations you play will show up here.',
      )
      content.append(empty)
      return
    }
    for (const station of list) content.append(stationCard(station))
  }

  function fillArt(container: HTMLElement, station: Station): void {
    container.innerHTML = ''
    const fallback = el('gf-icon')
    fallback.setAttribute('codepoint', '1F4E1')
    fallback.setAttribute('size', '32px')
    container.append(fallback)
    if (station.favicon) {
      const img = document.createElement('img')
      img.alt = ''
      img.loading = 'lazy'
      img.referrerPolicy = 'no-referrer'
      img.addEventListener('load', () => fallback.remove())
      img.addEventListener('error', () => img.remove())
      img.src = station.favicon
      container.prepend(img)
    }
  }

  function stationCard(station: Station): HTMLElement {
    const card = el('div', 'station-card')
    card.dataset.stationId = station.uuid
    if (player.currentStation?.uuid === station.uuid) card.classList.add('is-playing')

    const body = el('div', 'station-card__body')
    const head = el('div', 'station-card__head')
    const title = el('div', 'station-card__title')
    title.textContent = station.name
    const star = el('gf-button')
    star.setAttribute('size', 'sm')
    star.className = 'star'
    const isFavorite = favorites.some((item) => item.uuid === station.uuid)
    star.textContent = isFavorite ? '★' : '☆'
    star.title = isFavorite ? 'Remove favorite' : 'Add favorite'
    star.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleFavorite(station)
    })
    head.append(title, star)

    const meta = el('div', 'station-card__meta')
    if (station.country) {
      const countryLabel = el('span', 'muted')
      countryLabel.textContent = station.country
      meta.append(countryLabel)
    }
    const quality = [station.codec, station.bitrate ? `${station.bitrate}k` : ''].filter(Boolean).join(' · ')
    if (quality) {
      const qualityLabel = el('span', 'muted')
      qualityLabel.textContent = quality
      meta.append(qualityLabel)
    }
    const popularity = el('span', 'muted')
    popularity.textContent = `${station.clickCount} ▶ · ${station.votes} ♥`
    meta.append(popularity)

    body.append(head, meta)
    if (station.tags.length > 0) {
      const tags = el('div', 'station-card__tags')
      for (const value of station.tags.slice(0, 3)) {
        const chip = el('gf-chip')
        chip.textContent = value
        tags.append(chip)
      }
      body.append(tags)
    }

    const art = el('div', 'station-card__art')
    fillArt(art, station)
    card.append(art, body)
    card.addEventListener('click', () => void playStation(station))
    return card
  }

  function renderNowPlaying(state: PlayerState): void {
    const station = state.station
    if (!station) {
      nowPlaying.hidden = true
      return
    }
    nowPlaying.hidden = false
    nowPlaying.dataset.status = state.status
    if (npArt.dataset.stationId !== station.uuid) {
      npArt.dataset.stationId = station.uuid
      fillArt(npArt, station)
    }
    npTitle.textContent = station.name
    npMeta.textContent =
      [...station.tags.slice(0, 2), station.country].filter(Boolean).join(' · ') || station.language
    npCodec.textContent = [station.codec, station.bitrate ? `${station.bitrate}k` : '']
      .filter(Boolean)
      .join(' · ')
    playButton.textContent =
      state.status === 'playing' ? 'Pause' : state.status === 'loading' ? 'Connecting…' : 'Play'
    playButton.toggleAttribute('disabled', state.status === 'loading')
    voteButton.textContent = voted.includes(station.uuid) ? 'Voted ✓' : 'Vote'
    voteButton.toggleAttribute('disabled', voted.includes(station.uuid))
  }

  // ---- events -------------------------------------------------------------
  search.addEventListener('gf-input', (event) => {
    query = (event as CustomEvent<{ value: string }>).detail.value
    if (view !== 'search') setView('search')
    if (searchTimer !== null) window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS)
  })

  orderSelect.addEventListener('gf-change', (event) => {
    order = (event as CustomEvent<{ value: StationOrder }>).detail.value
    if (view === 'search') void runSearch()
    else void loadTop()
  })

  playButton.addEventListener('click', () => player.toggle())
  prevButton.addEventListener('click', () => changeStation(-1))
  nextButton.addEventListener('click', () => changeStation(1))
  voteButton.addEventListener('click', () => {
    const station = player.currentStation
    if (station) void castVote(station)
  })

  volumeSlider.addEventListener('gf-input', (event) => {
    volumeLevel = (event as CustomEvent<{ value: number }>).detail.value / 100
    player.setVolume(volumeLevel)
  })
  volumeSlider.addEventListener('gf-change', () => {
    void gf.storage.set(VOLUME_KEY, volumeLevel)
  })

  sleepSelect.addEventListener('gf-change', (event) => {
    const minutes = Number((event as CustomEvent<{ value: string }>).detail.value)
    if (sleepTimer !== null) {
      window.clearTimeout(sleepTimer)
      sleepTimer = null
    }
    if (minutes > 0) {
      sleepTimer = window.setTimeout(() => {
        player.stop()
        sleepTimer = null
        sleepSelect.setAttribute('value', '0')
        gf.ui.toast('Sleep timer — playback stopped', { variant: 'ok' })
      }, minutes * 60000)
      gf.ui.toast(`Sleep timer set for ${minutes} minutes`)
    }
  })

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, gf-input, gf-textarea, gf-select')) return
    if (event.code === 'Space') {
      event.preventDefault()
      player.toggle()
    } else if (event.key === 'ArrowRight') {
      changeStation(1)
    } else if (event.key === 'ArrowLeft') {
      changeStation(-1)
    }
  })

  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      favorites = (await gf.storage.get<Station[]>(FAVORITES_KEY)) ?? []
      recent = (await gf.storage.get<Station[]>(RECENT_KEY)) ?? []
      voted = (await gf.storage.get<string[]>(VOTES_KEY)) ?? []
      volumeLevel = (await gf.storage.get<number>(VOLUME_KEY)) ?? volumeLevel
      player.setVolume(volumeLevel)
      volumeSlider.setAttribute('value', String(Math.round(volumeLevel * 100)))
      renderGrid()
      renderNowPlaying(player.state)
      updateSubtitle()
      gf.ui.toast('Profile changed')
    })()
  })

  renderViewBar()
  renderGrid()
  renderNowPlaying(player.state)
  updateSubtitle()

  await Promise.all([loadTop(), loadFilters()])
  await gf.storage.init()
}

void start()
