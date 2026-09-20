import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  fetchChannels,
  fetchSongs,
  formatStreamLabel,
  resolveStreamUrls,
  selectStream,
  type Channel,
  type QualityPref,
  type Song,
  type StreamVariant,
} from './somafm'
import { RadioPlayer, type PlayerState } from './player'

const FAVORITES_KEY = 'favorites'
const RECENT_KEY = 'recent'
const VOLUME_KEY = 'volume'
const QUALITY_KEY = 'qualityPref'
const LAST_KEY = 'lastChannel'

const QUALITY_LABELS: Record<QualityPref, string> = {
  best: 'Quality: best',
  balanced: 'Quality: balanced',
  saver: 'Quality: data saver',
}

type View = 'all' | 'favorites' | 'recent'

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'recent', label: 'Recent' },
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

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  let profile = await gf.profile.getCurrent()
  const storedFavorites = (await gf.storage.get<string[]>(FAVORITES_KEY)) ?? []
  const storedRecent = (await gf.storage.get<string[]>(RECENT_KEY)) ?? []
  const storedVolume = (await gf.storage.get<number>(VOLUME_KEY)) ?? 0.8
  const storedQuality = (await gf.storage.get<QualityPref>(QUALITY_KEY)) ?? 'best'
  const lastChannelId = await gf.storage.get<string>(LAST_KEY)

  let channels: Channel[] = []
  let favorites = [...storedFavorites]
  let recent = [...storedRecent]
  let volumeLevel = storedVolume
  let qualityPref: QualityPref = storedQuality
  let view: View = 'all'
  let query = ''
  let genre = ''
  let song: Song | null = null
  let lastError: string | null = null
  let pollTimer: number | null = null
  let sleepTimer: number | null = null

  // ---- shell --------------------------------------------------------------
  const header = el('gf-page-header')
  header.setAttribute('title', 'SomaFM')
  header.setAttribute('subtitle', `${profile.name} · loading channels…`)

  const toolbar = el('div', 'radio-toolbar')
  const search = el('gf-input')
  search.setAttribute('placeholder', 'Search channels…')
  search.className = 'search'

  const genreSelect = el('gf-select')
  genreSelect.className = 'genre-select'

  const qualitySelect = el('gf-select')
  qualitySelect.className = 'quality-select'
  for (const value of Object.keys(QUALITY_LABELS) as QualityPref[]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = QUALITY_LABELS[value]
    qualitySelect.append(option)
  }
  qualitySelect.setAttribute('value', qualityPref)

  const sleepSelect = el('gf-select')
  sleepSelect.className = 'sleep-select'
  for (const [value, label] of [
    ['0', 'Sleep timer: off'],
    ['15', 'Sleep timer: 15m'],
    ['30', 'Sleep timer: 30m'],
    ['60', 'Sleep timer: 60m'],
  ] as const) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    sleepSelect.append(option)
  }
  sleepSelect.setAttribute('value', '0')

  toolbar.append(search, qualitySelect, sleepSelect)

  const viewBar = el('div', 'view-bar')
  const content = el('div', 'channel-grid')

  const nowPlaying = el('div', 'now-playing')
  nowPlaying.hidden = true
  const npMain = el('div', 'now-playing__main')
  const npArt = el('img', 'now-playing__art')
  npArt.alt = ''
  const npInfo = el('div', 'now-playing__info')
  const npTitle = el('div', 'now-playing__title')
  const npSong = el('div', 'now-playing__song')
  npInfo.append(npTitle, npSong)
  const npButtons = el('div', 'now-playing__buttons')
  const playButton = el('gf-button')
  playButton.setAttribute('variant', 'primary')
  playButton.textContent = 'Play'
  const historyButton = el('gf-button')
  historyButton.setAttribute('size', 'sm')
  historyButton.textContent = 'History'
  npButtons.append(playButton, historyButton)
  npMain.append(npArt, npInfo, npButtons)
  const npFoot = el('div', 'now-playing__foot')
  const volumeSlider = el('gf-slider')
  volumeSlider.className = 'now-playing__volume'
  volumeSlider.setAttribute('min', '0')
  volumeSlider.setAttribute('max', '100')
  volumeSlider.setAttribute('value', String(Math.round(volumeLevel * 100)))
  const npQuality = el('span', 'now-playing__quality')
  npFoot.append(volumeSlider, npQuality)
  nowPlaying.append(npMain, npFoot)

  root.append(header, toolbar, viewBar, content, nowPlaying)

  const player = new RadioPlayer((stream: StreamVariant) => resolveStreamUrls(gf.cache, stream.playlistUrl), {
    onState: (state) => {
      renderNowPlaying(state)
      syncPolling(state)
    },
    onTrackChange: (direction) => changeChannel(direction === 'next' ? 1 : -1),
  })
  player.setVolume(volumeLevel)

  // ---- data ---------------------------------------------------------------
  async function loadChannels(): Promise<void> {
    renderSkeleton()
    try {
      channels = await fetchChannels(gf.cache)
      header.setAttribute('subtitle', `${profile.name} · ${channels.length} channels`)
      populateGenres()
      if (lastChannelId) {
        const channel = channels.find((item) => item.id === lastChannelId)
        const stream = channel ? selectStream(channel, qualityPref) : null
        if (channel && stream) player.load(channel, stream)
      }
      renderViewBar()
      renderGrid()
    } catch (error) {
      header.setAttribute('subtitle', 'SomaFM')
      renderGridError((error as Error).message)
    }
  }

  function populateGenres(): void {
    const genres = new Set<string>()
    for (const channel of channels) for (const value of channel.genre) genres.add(value)
    const options = ['', ...[...genres].sort()]
    genreSelect.innerHTML = ''
    for (const value of options) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = value || 'All genres'
      genreSelect.append(option)
    }
    genreSelect.setAttribute('value', genre)
    toolbar.insertBefore(genreSelect, qualitySelect)
  }

  function visibleChannels(): Channel[] {
    const q = query.trim().toLowerCase()
    let list = channels
    if (view === 'favorites') {
      list = list.filter((channel) => favorites.includes(channel.id))
    } else if (view === 'recent') {
      list = recent
        .map((id) => channels.find((channel) => channel.id === id))
        .filter((channel): channel is Channel => Boolean(channel))
    }
    if (genre) list = list.filter((channel) => channel.genre.includes(genre))
    if (q) {
      list = list.filter((channel) =>
        `${channel.title} ${channel.description} ${channel.genre.join(' ')} ${channel.dj}`
          .toLowerCase()
          .includes(q),
      )
    }
    if (view === 'all') list = [...list].sort((a, b) => b.listeners - a.listeners)
    return list
  }

  async function pollSong(): Promise<void> {
    const channel = player.currentChannel
    if (!channel) return
    try {
      const songs = await fetchSongs(gf.cache, channel.id)
      song = songs[0] ?? null
      player.setSong(song)
      renderNowPlaying(player.state)
      if (song) updateChannelLastPlaying(channel.id, `${song.artist} – ${song.title}`)
    } catch {
      // Transient network hiccups are ignored; the next tick retries.
    }
  }

  function syncPolling(state: PlayerState): void {
    const shouldPoll = state.status === 'playing'
    if (shouldPoll && pollTimer === null) {
      pollTimer = window.setInterval(() => void pollSong(), 15000)
      void pollSong()
    } else if (!shouldPoll && pollTimer !== null) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function updateChannelLastPlaying(id: string, text: string): void {
    const channel = channels.find((item) => item.id === id)
    if (channel) channel.lastPlaying = text
    const node = content.querySelector(`[data-channel-id="${id}"] .channel-card__last`)
    if (node) node.textContent = `♪ ${text}`
  }

  // ---- actions ------------------------------------------------------------
  async function playChannel(channel: Channel): Promise<void> {
    const stream = selectStream(channel, qualityPref)
    if (!stream) {
      gf.ui.toast('No stream available for this channel', { variant: 'danger' })
      return
    }
    song = null
    markRecent(channel.id)
    await gf.storage.set(LAST_KEY, channel.id)
    void player.play(channel, stream)
    renderGrid()
  }

  function markRecent(id: string): void {
    recent = [id, ...recent.filter((item) => item !== id)].slice(0, 10)
    void gf.storage.set(RECENT_KEY, recent)
    if (view === 'recent') renderGrid()
  }

  function toggleFavorite(id: string): void {
    if (favorites.includes(id)) favorites = favorites.filter((item) => item !== id)
    else favorites = [id, ...favorites]
    void gf.storage.set(FAVORITES_KEY, favorites)
    renderGrid()
  }

  function changeChannel(delta: number): void {
    const list = visibleChannels()
    if (list.length === 0) return
    const currentId = player.currentChannel?.id
    const index = list.findIndex((channel) => channel.id === currentId)
    const next = list[(index + delta + list.length) % list.length] ?? list[0]!
    void playChannel(next)
  }

  async function openHistory(channel: Channel): Promise<void> {
    const modal = el('gf-modal')
    modal.setAttribute('title', `${channel.title} — history`)
    const body = el('div', 'history')
    body.append(el('gf-spinner'))
    modal.append(body)
    modal.addEventListener('gf-close', () => modal.remove())
    document.body.append(modal)
    modal.open()
    try {
      const songs = await fetchSongs(gf.cache, channel.id)
      body.innerHTML = ''
      if (songs.length === 0) {
        body.textContent = 'No history available for this channel.'
        return
      }
      for (const entry of songs.slice(0, 20)) {
        const row = el('div', 'history__row')
        const title = el('div', 'history__title')
        title.textContent = entry.title
        const meta = el('div', 'history__meta')
        meta.textContent = [entry.artist, entry.album].filter(Boolean).join(' · ')
        row.append(title, meta)
        body.append(row)
      }
    } catch (error) {
      body.textContent = `Could not load history: ${(error as Error).message}`
    }
  }

  // ---- rendering ----------------------------------------------------------
  function renderSkeleton(): void {
    content.innerHTML = ''
    for (let i = 0; i < 8; i += 1) {
      const card = el('div', 'channel-card channel-card--skeleton')
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
    empty.setAttribute('title', 'Could not load SomaFM')
    empty.setAttribute('text', message)
    const retry = el('gf-button')
    retry.setAttribute('variant', 'primary')
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => void loadChannels())
    empty.append(retry)
    content.append(empty)
  }

  function renderViewBar(): void {
    viewBar.innerHTML = ''
    for (const item of VIEWS) {
      const chip = el('gf-chip')
      if (item.value === view) chip.setAttribute('active', '')
      chip.textContent = item.label
      chip.addEventListener('click', () => {
        view = item.value
        renderViewBar()
        renderGrid()
      })
      viewBar.append(chip)
    }
  }

  function renderGrid(): void {
    content.innerHTML = ''
    const list = visibleChannels()
    if (list.length === 0) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F4FB')
      empty.setAttribute('title', 'No channels')
      empty.setAttribute('text', 'Try another search, genre or view.')
      content.append(empty)
      return
    }
    for (const channel of list) content.append(channelCard(channel))
  }

  function channelCard(channel: Channel): HTMLElement {
    const card = el('div', 'channel-card')
    card.dataset.channelId = channel.id
    if (player.currentChannel?.id === channel.id) card.classList.add('is-playing')

    const art = el('img', 'channel-card__art')
    art.loading = 'lazy'
    art.alt = ''
    art.src = channel.largeImage

    const body = el('div', 'channel-card__body')
    const head = el('div', 'channel-card__head')
    const title = el('div', 'channel-card__title')
    title.textContent = channel.title
    const star = el('gf-button')
    star.setAttribute('size', 'sm')
    star.className = 'star'
    const isFavorite = favorites.includes(channel.id)
    star.textContent = isFavorite ? '★' : '☆'
    star.title = isFavorite ? 'Remove favorite' : 'Add favorite'
    star.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleFavorite(channel.id)
    })
    head.append(title, star)

    const description = el('div', 'channel-card__desc')
    description.textContent = channel.description

    const meta = el('div', 'channel-card__meta')
    const listeners = el('span', 'muted')
    listeners.textContent = `${channel.listeners} listening`
    meta.append(listeners)
    if (channel.dj) {
      const dj = el('span', 'muted')
      dj.textContent = `DJ ${channel.dj}`
      meta.append(dj)
    }

    body.append(head, description, meta)
    if (channel.genre.length > 0) {
      const genres = el('div', 'channel-card__genres')
      for (const value of channel.genre.slice(0, 3)) {
        const chip = el('gf-chip')
        chip.textContent = value
        genres.append(chip)
      }
      body.append(genres)
    }
    if (channel.lastPlaying) {
      const last = el('div', 'channel-card__last')
      last.textContent = `♪ ${channel.lastPlaying}`
      body.append(last)
    }

    card.append(art, body)
    card.addEventListener('click', () => void playChannel(channel))
    return card
  }

  function renderNowPlaying(state: PlayerState): void {
    const channel = state.channel
    if (!channel) {
      nowPlaying.hidden = true
      return
    }
    nowPlaying.hidden = false
    nowPlaying.dataset.status = state.status
    if (npArt.getAttribute('src') !== channel.largeImage) npArt.src = channel.largeImage
    npTitle.textContent = channel.title
    npSong.textContent = song
      ? `${song.artist} — ${song.title}`
      : channel.lastPlaying || channel.description
    npQuality.textContent = state.stream ? formatStreamLabel(state.stream) : ''
    playButton.textContent =
      state.status === 'playing' ? 'Pause' : state.status === 'loading' ? 'Connecting…' : 'Play'
    playButton.toggleAttribute('disabled', state.status === 'loading')
    if (state.error && state.error !== lastError) {
      gf.ui.toast(state.error, { variant: 'danger' })
    }
    lastError = state.error
  }

  // ---- events -------------------------------------------------------------
  search.addEventListener('gf-input', (event) => {
    query = (event as CustomEvent<{ value: string }>).detail.value
    renderGrid()
  })

  genreSelect.addEventListener('gf-change', (event) => {
    genre = (event as CustomEvent<{ value: string }>).detail.value
    renderGrid()
  })

  qualitySelect.addEventListener('gf-change', (event) => {
    qualityPref = (event as CustomEvent<{ value: QualityPref }>).detail.value
    void gf.storage.set(QUALITY_KEY, qualityPref)
    const channel = player.currentChannel
    if (channel && player.state.status !== 'idle') {
      const stream = selectStream(channel, qualityPref)
      if (stream) void player.play(channel, stream)
    }
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
        gf.ui.toast('Sleep timer — playback stopped', { variant: 'ok' })
      }, minutes * 60000)
      gf.ui.toast(`Sleep timer set for ${minutes} minutes`)
    }
  })

  playButton.addEventListener('click', () => player.toggle())
  historyButton.addEventListener('click', () => {
    const channel = player.currentChannel
    if (channel) void openHistory(channel)
  })

  volumeSlider.addEventListener('gf-input', (event) => {
    volumeLevel = (event as CustomEvent<{ value: number }>).detail.value / 100
    player.setVolume(volumeLevel)
  })
  volumeSlider.addEventListener('gf-change', () => {
    void gf.storage.set(VOLUME_KEY, volumeLevel)
  })

  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, gf-input, gf-textarea, gf-select')) return
    if (event.code === 'Space') {
      event.preventDefault()
      player.toggle()
    } else if (event.key === 'ArrowRight') {
      changeChannel(1)
    } else if (event.key === 'ArrowLeft') {
      changeChannel(-1)
    }
  })

  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      favorites = (await gf.storage.get<string[]>(FAVORITES_KEY)) ?? []
      recent = (await gf.storage.get<string[]>(RECENT_KEY)) ?? []
      volumeLevel = (await gf.storage.get<number>(VOLUME_KEY)) ?? volumeLevel
      qualityPref = (await gf.storage.get<QualityPref>(QUALITY_KEY)) ?? qualityPref
      player.setVolume(volumeLevel)
      volumeSlider.setAttribute('value', String(Math.round(volumeLevel * 100)))
      qualitySelect.setAttribute('value', qualityPref)
      header.setAttribute('subtitle', `${profile.name} · ${channels.length} channels`)
      renderGrid()
      renderNowPlaying(player.state)
      gf.ui.toast('Profile changed')
    })()
  })

  await loadChannels()
  await gf.storage.init()
}

void start()
