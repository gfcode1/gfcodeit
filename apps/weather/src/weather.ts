import type { GFCacheApi } from '../../../src/core/cache'

export type Units = 'metric' | 'imperial'

const GEO_TTL_MS = 7 * 24 * 60 * 60_000
const FORECAST_TTL_MS = 15 * 60_000
const FORECAST_STALE_MS = 24 * 60 * 60_000

export interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
}

export interface Location {
  name: string
  latitude: number
  longitude: number
  country?: string
}

export interface CurrentWeather {
  time: string
  temperature: number
  apparentTemperature: number
  humidity: number
  precipitation: number
  weatherCode: number
  windSpeed: number
  isDay: boolean
}

export interface HourlyPoint {
  time: string
  temperature: number
  weatherCode: number
  precipitationProbability: number
  isDay: boolean
}

export interface DailyPoint {
  date: string
  weatherCode: number
  tempMax: number
  tempMin: number
  precipitationProbability: number
  sunrise: string
  sunset: string
}

export interface Forecast {
  timezone: string
  current: CurrentWeather
  hourly: HourlyPoint[]
  daily: DailyPoint[]
}

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export async function geocode(
  cache: GFCacheApi,
  query: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })
  const data = await cache.fetchJson<{ results?: GeoResult[] }>(`geo:${params}`, `${GEO_URL}?${params}`, {
    ttlMs: GEO_TTL_MS,
    staleTtlMs: GEO_TTL_MS,
    signal,
  })
  return data.results ?? []
}

interface RawForecast {
  timezone: string
  current: {
    time: string
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    precipitation: number
    weather_code: number
    wind_speed_10m: number
    is_day: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    weather_code: number[]
    precipitation_probability: number[]
    is_day: number[]
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
    sunrise: string[]
    sunset: string[]
  }
}

export async function fetchForecast(
  cache: GFCacheApi,
  location: Location,
  units: Units,
  signal?: AbortSignal,
): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  })
  if (units === 'imperial') {
    params.set('temperature_unit', 'fahrenheit')
    params.set('wind_speed_unit', 'mph')
    params.set('precipitation_unit', 'inch')
  }
  const key = `forecast:${location.latitude},${location.longitude},${units}`
  const data = await cache.fetchJson<RawForecast>(key, `${FORECAST_URL}?${params}`, {
    ttlMs: FORECAST_TTL_MS,
    staleTtlMs: FORECAST_STALE_MS,
    signal,
  })

  const current: CurrentWeather = {
    time: data.current.time,
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    isDay: data.current.is_day === 1,
  }

  const startIndex = Math.max(0, data.hourly.time.findIndex((time) => time >= current.time))
  const hourly: HourlyPoint[] = []
  for (let i = startIndex; i < Math.min(startIndex + 24, data.hourly.time.length); i += 1) {
    hourly.push({
      time: data.hourly.time[i]!,
      temperature: data.hourly.temperature_2m[i]!,
      weatherCode: data.hourly.weather_code[i]!,
      precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
      isDay: data.hourly.is_day[i] === 1,
    })
  }

  const daily: DailyPoint[] = data.daily.time.map((date, i) => ({
    date,
    weatherCode: data.daily.weather_code[i]!,
    tempMax: data.daily.temperature_2m_max[i]!,
    tempMin: data.daily.temperature_2m_min[i]!,
    precipitationProbability: data.daily.precipitation_probability_max[i] ?? 0,
    sunrise: data.daily.sunrise[i]!,
    sunset: data.daily.sunset[i]!,
  }))

  return { timezone: data.timezone, current, hourly, daily }
}

interface CodeInfo {
  label: string
  icon: string
}

const CODES: Record<number, CodeInfo> = {
  0: { label: 'Clear sky', icon: '2600' },
  1: { label: 'Mainly clear', icon: '1F324' },
  2: { label: 'Partly cloudy', icon: '26C5' },
  3: { label: 'Overcast', icon: '2601' },
  45: { label: 'Fog', icon: '1F32B' },
  48: { label: 'Rime fog', icon: '1F32B' },
  51: { label: 'Light drizzle', icon: '1F326' },
  53: { label: 'Drizzle', icon: '1F326' },
  55: { label: 'Dense drizzle', icon: '1F326' },
  56: { label: 'Freezing drizzle', icon: '1F327' },
  57: { label: 'Freezing drizzle', icon: '1F327' },
  61: { label: 'Light rain', icon: '1F327' },
  63: { label: 'Rain', icon: '1F327' },
  65: { label: 'Heavy rain', icon: '1F327' },
  66: { label: 'Freezing rain', icon: '1F327' },
  67: { label: 'Freezing rain', icon: '1F327' },
  71: { label: 'Light snow', icon: '1F328' },
  73: { label: 'Snow', icon: '1F328' },
  75: { label: 'Heavy snow', icon: '1F328' },
  77: { label: 'Snow grains', icon: '2744' },
  80: { label: 'Rain showers', icon: '1F326' },
  81: { label: 'Rain showers', icon: '1F326' },
  82: { label: 'Violent showers', icon: '1F326' },
  85: { label: 'Snow showers', icon: '1F328' },
  86: { label: 'Snow showers', icon: '1F328' },
  95: { label: 'Thunderstorm', icon: '26C8' },
  96: { label: 'Thunderstorm, hail', icon: '1F329' },
  99: { label: 'Thunderstorm, hail', icon: '1F329' },
}

export function describeCode(code: number, isDay = true): CodeInfo {
  const info = CODES[code] ?? { label: 'Unknown', icon: '1F321' }
  if (!isDay) {
    if (code === 0) return { label: 'Clear night', icon: '1F319' }
    if (code === 1) return { label: 'Mainly clear', icon: '1F31B' }
    if (code === 2) return { label: 'Partly cloudy', icon: '1F31C' }
  }
  return info
}

export function formatTemp(value: number, units: Units): string {
  return `${Math.round(value)}°${units === 'imperial' ? 'F' : 'C'}`
}

export function formatWind(value: number, units: Units): string {
  return `${Math.round(value)} ${units === 'imperial' ? 'mph' : 'km/h'}`
}

export function formatPrecip(value: number, units: Units): string {
  const unit = units === 'imperial' ? 'in' : 'mm'
  return `${value.toFixed(units === 'imperial' ? 2 : 1)} ${unit}`
}

export function hourLabel(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
}

export function dayLabel(iso: string, index: number): string {
  if (index === 0) return 'Today'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

export function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
