import './styles.css'
import type { GFApi } from '../../../src/core/sdk'
import {
  clockLabel,
  dayLabel,
  describeCode,
  fetchForecast,
  formatPrecip,
  formatTemp,
  formatWind,
  geocode,
  hourLabel,
  type Forecast,
  type GeoResult,
  type Location,
  type Units,
} from './weather'

const LOCATION_KEY = 'location'
const UNITS_KEY = 'units'

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

function icon(codepoint: string, size: string): HTMLElement {
  const node = el('gf-icon')
  node.setAttribute('codepoint', codepoint)
  node.setAttribute('size', size)
  return node
}

async function start(): Promise<void> {
  const gf = await bootstrapRuntime()
  const root = document.getElementById('app')!

  let profile = await gf.profile.getCurrent()
  let location = (await gf.storage.get<Location | null>(LOCATION_KEY)) ?? null
  let units = (await gf.storage.get<Units>(UNITS_KEY)) ?? 'metric'
  let forecast: Forecast | null = null
  let results: GeoResult[] = []
  let controller: AbortController | null = null

  // ---- static shell -------------------------------------------------------
  const header = el('gf-page-header')
  header.setAttribute('title', 'Weather')
  header.setAttribute('subtitle', `Open-Meteo · profile: ${profile.name}`)

  const toolbar = el('div', 'weather-toolbar')
  const searchInput = el('gf-input')
  searchInput.setAttribute('placeholder', 'Search a city…')
  const searchButton = el('gf-button')
  searchButton.setAttribute('variant', 'primary')
  searchButton.textContent = 'Search'
  const locateButton = el('gf-button')
  locateButton.textContent = 'My location'
  locateButton.title = 'Use current location'
  const unitsSelect = el('gf-select')
  unitsSelect.className = 'units-select'
  for (const [value, label] of [['metric', '°C km/h'], ['imperial', '°F mph']] as const) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    unitsSelect.append(option)
  }
  unitsSelect.setAttribute('value', units)
  unitsSelect.addEventListener('gf-change', (event) => {
    units = (event as CustomEvent<{ value: Units }>).detail.value
    void gf.storage.set(UNITS_KEY, units)
    void load()
  })
  toolbar.append(searchInput, searchButton, locateButton, unitsSelect)

  const resultsBox = el('div', 'results')
  const content = el('div', 'content')

  root.append(header, toolbar, resultsBox, content)

  // ---- data ---------------------------------------------------------------
  async function load(): Promise<void> {
    if (!location) {
      renderContent()
      return
    }
    controller?.abort()
    controller = new AbortController()
    renderLoading()
    try {
      forecast = await fetchForecast(gf.cache, location, units, controller.signal)
      renderContent()
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      renderError((error as Error).message)
    }
  }

  async function search(query: string): Promise<void> {
    const value = query.trim()
    if (!value) return
    controller?.abort()
    controller = new AbortController()
    try {
      results = await geocode(gf.cache, value, controller.signal)
      renderResults()
      if (results.length === 0) gf.ui.toast('No matching place', { variant: 'danger' })
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      gf.ui.toast(`Search failed: ${(error as Error).message}`, { variant: 'danger' })
    }
  }

  async function choose(result: GeoResult): Promise<void> {
    location = {
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
    }
    results = []
    renderResults()
    await gf.storage.set(LOCATION_KEY, location)
    gf.ui.toast(`Showing weather for ${result.name}`, { variant: 'ok' })
    await load()
  }

  function useMyLocation(): void {
    if (!navigator.geolocation) {
      gf.ui.toast('Geolocation not supported', { variant: 'danger' })
      return
    }
    locateButton.setAttribute('disabled', '')
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        location = {
          name: 'My location',
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
        }
        locateButton.removeAttribute('disabled')
        await gf.storage.set(LOCATION_KEY, location)
        await load()
      },
      (error) => {
        locateButton.removeAttribute('disabled')
        gf.ui.toast(`Location unavailable: ${error.message}`, { variant: 'danger' })
      },
      { timeout: 10000 },
    )
  }

  // ---- rendering ----------------------------------------------------------
  function renderResults(): void {
    resultsBox.innerHTML = ''
    if (results.length === 0) return
    for (const result of results) {
      const button = el('button', 'result')
      button.type = 'button'
      const label = el('span')
      label.textContent = result.name
      const meta = el('span', 'muted')
      meta.textContent = [result.admin1, result.country].filter(Boolean).join(', ')
      button.append(label, meta)
      button.addEventListener('click', () => void choose(result))
      resultsBox.append(button)
    }
  }

  function renderLoading(): void {
    content.innerHTML = ''
    const wrap = el('div', 'loading')
    wrap.append(el('gf-spinner'), document.createTextNode('Loading forecast…'))
    content.append(wrap)
  }

  function renderError(message: string): void {
    content.innerHTML = ''
    const empty = el('gf-empty-state')
    empty.setAttribute('icon', '26A0')
    empty.setAttribute('title', 'Could not load weather')
    empty.setAttribute('text', message)
    const retry = el('gf-button')
    retry.setAttribute('variant', 'primary')
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => void load())
    empty.append(retry)
    content.append(empty)
  }

  function renderContent(): void {
    content.innerHTML = ''
    if (!location || !forecast) {
      const empty = el('gf-empty-state')
      empty.setAttribute('icon', '1F30D')
      empty.setAttribute('title', 'No location selected')
      empty.setAttribute('text', 'Search for a city or use your current location.')
      content.append(empty)
      return
    }

    const { current, hourly, daily } = forecast
    const info = describeCode(current.weatherCode, current.isDay)

    // Alert badge: any relevant precipitation expected in the next 24h.
    const alerts = hourly.filter((h) => h.precipitationProbability >= 60 || h.weatherCode >= 61).length
    gf.ui.badge(alerts > 0 ? 1 : 0)

    // current
    const currentCard = el('gf-card')
    const currentRow = el('div', 'current')
    const bigIcon = icon(info.icon, '72px')
    bigIcon.classList.add('current__icon')
    const temp = el('div', 'current__temp')
    temp.textContent = formatTemp(current.temperature, units)
    const meta = el('div', 'current__meta')
    const place = el('div', 'current__place')
    place.textContent = [location.name, location.country].filter(Boolean).join(', ')
    const desc = el('div')
    desc.textContent = `${info.label} · feels like ${formatTemp(current.apparentTemperature, units)}`
    const updated = el('div', 'muted')
    updated.textContent = `Updated ${clockLabel(current.time)} · ${forecast.timezone}`
    meta.append(place, desc, updated)
    currentRow.append(bigIcon, temp, meta)

    const details = el('div', 'details')
    details.append(
      detail('Humidity', `${Math.round(current.humidity)}%`),
      detail('Wind', formatWind(current.windSpeed, units)),
      detail('Precipitation', formatPrecip(current.precipitation, units)),
      detail('Today', `${formatTemp(daily[0]!.tempMax, units)} / ${formatTemp(daily[0]!.tempMin, units)}`),
      detail('Sunrise', clockLabel(daily[0]!.sunrise)),
      detail('Sunset', clockLabel(daily[0]!.sunset)),
    )
    currentCard.append(currentRow, details)

    // hourly
    const hourlyCard = el('gf-card')
    const hourlyTitle = el('div', 'section-title')
    hourlyTitle.textContent = 'Next 24 hours'
    const hourlyStrip = el('div', 'hourly')
    for (const point of hourly) {
      const hour = el('div', 'hour')
      const time = el('div', 'hour__time')
      time.textContent = hourLabel(point.time)
      const pointInfo = describeCode(point.weatherCode, point.isDay)
      const pointIcon = icon(pointInfo.icon, '26px')
      const pointTemp = el('div', 'hour__temp')
      pointTemp.textContent = formatTemp(point.temperature, units)
      const pop = el('div', 'hour__pop')
      pop.textContent = point.precipitationProbability >= 10 ? `${point.precipitationProbability}%` : ''
      hour.title = pointInfo.label
      hour.append(time, pointIcon, pointTemp, pop)
      hourlyStrip.append(hour)
    }
    hourlyCard.append(hourlyTitle, hourlyStrip)

    // daily
    const dailyCard = el('gf-card')
    const dailyTitle = el('div', 'section-title')
    dailyTitle.textContent = '7-day forecast'
    const dailyList = el('div', 'daily')
    daily.forEach((day, index) => {
      const dayInfo = describeCode(day.weatherCode, true)
      const row = el('div', 'day')
      const name = el('div', 'day__name')
      name.textContent = dayLabel(day.date, index)
      const rowIcon = icon(dayInfo.icon, '26px')
      rowIcon.title = dayInfo.label
      const temps = el('div', 'day__temps')
      const max = el('span')
      max.textContent = formatTemp(day.tempMax, units)
      const min = el('span', 'min')
      min.textContent = ` / ${formatTemp(day.tempMin, units)}`
      temps.append(max, min)
      const pop = el('div', 'day__pop')
      pop.textContent = day.precipitationProbability >= 10 ? `${day.precipitationProbability}%` : ''
      row.append(name, rowIcon, temps, pop, el('span'))
      dailyList.append(row)
    })
    dailyCard.append(dailyTitle, dailyList)

    const refresh = el('gf-button')
    refresh.textContent = 'Refresh'
    refresh.addEventListener('click', () => void load())

    content.append(currentCard, hourlyCard, dailyCard, refresh)
  }

  function detail(label: string, value: string): HTMLElement {
    const box = el('div', 'detail')
    const l = el('div', 'detail__label')
    l.textContent = label
    const v = el('div', 'detail__value')
    v.textContent = value
    box.append(l, v)
    return box
  }

  // ---- events -------------------------------------------------------------
  searchButton.addEventListener('click', () => void search(searchInput.value))
  searchInput.addEventListener('gf-change', () => void search(searchInput.value))
  searchInput.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') void search(searchInput.value)
  })
  locateButton.addEventListener('click', useMyLocation)
  gf.on('profileChanged', () => {
    void (async () => {
      profile = await gf.profile.getCurrent()
      header.setAttribute('subtitle', `Open-Meteo · profile: ${profile.name}`)
      void gf.ui.toast('Profile changed')
      await load()
    })()
  })

  renderResults()
  await load()
}

void start()
