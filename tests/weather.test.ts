import { describe, expect, it, vi } from 'vitest'
import { describeCode, fetchForecast, formatPrecip, formatTemp, formatWind, geocode } from '../apps/weather/src/weather'
import type { GFCacheApi } from '../src/core/cache'

function fakeCache(payload: unknown) {
  const fetchJson = vi.fn(async (_key: string, _url: string) => payload)
  return { cache: { fetchJson } as unknown as GFCacheApi, fetchJson }
}

function rawForecast() {
  const times = Array.from({ length: 40 }, (_, i) => `2026-09-19T${String(i).padStart(2, '0')}:00`)
  return {
    timezone: 'Europe/Rome',
    current: {
      time: '2026-09-19T10:00',
      temperature_2m: 20,
      relative_humidity_2m: 50,
      apparent_temperature: 19,
      precipitation: 0,
      weather_code: 1,
      wind_speed_10m: 5,
      is_day: 1,
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 18),
      weather_code: times.map(() => 1),
      precipitation_probability: times.map(() => 5),
      is_day: times.map(() => 1),
    },
    daily: {
      time: ['2026-09-19', '2026-09-20'],
      weather_code: [1, 2],
      temperature_2m_max: [25, 24],
      temperature_2m_min: [15, 14],
      precipitation_probability_max: [10, 20],
      sunrise: ['2026-09-19T06:00', '2026-09-20T06:01'],
      sunset: ['2026-09-19T19:00', '2026-09-20T18:58'],
    },
  }
}

const location = { name: 'Rome', latitude: 41.9, longitude: 12.5 }

describe('fetchForecast', () => {
  it('maps the raw payload into the forecast model', async () => {
    const { cache } = fakeCache(rawForecast())
    const forecast = await fetchForecast(cache, location, 'metric')
    expect(forecast.current).toMatchObject({ temperature: 20, isDay: true })
    expect(forecast.hourly).toHaveLength(24)
    expect(forecast.hourly[0]?.time).toBe('2026-09-19T10:00')
    expect(forecast.daily).toHaveLength(2)
    expect(forecast.daily[0]).toMatchObject({ date: '2026-09-19', tempMax: 25, tempMin: 15 })
  })

  it('requests imperial units when selected', async () => {
    const { cache, fetchJson } = fakeCache(rawForecast())
    await fetchForecast(cache, location, 'imperial')
    const url = fetchJson.mock.calls[0]?.[1] as string
    expect(url).toContain('temperature_unit=fahrenheit')
    expect(url).toContain('wind_speed_unit=mph')
    expect(url).toContain('precipitation_unit=inch')
  })
})

describe('geocode', () => {
  it('returns the results array and defaults to empty', async () => {
    const { cache } = fakeCache({ results: [{ name: 'Rome', latitude: 41.9, longitude: 12.5 }] })
    expect(await geocode(cache, 'rome')).toHaveLength(1)
    const empty = fakeCache({})
    expect(await geocode(empty.cache, 'nowhere')).toEqual([])
  })
})

describe('formatting', () => {
  it('describes weather codes, with night variants', () => {
    expect(describeCode(0, true)).toEqual({ label: 'Clear sky', icon: '2600' })
    expect(describeCode(0, false).label).toBe('Clear night')
    expect(describeCode(2, false).icon).toBe('1F31C')
    expect(describeCode(999).label).toBe('Unknown')
  })

  it('formats temperatures, wind and precipitation per unit system', () => {
    expect(formatTemp(19.6, 'metric')).toBe('20°C')
    expect(formatTemp(19.6, 'imperial')).toBe('20°F')
    expect(formatWind(12.4, 'metric')).toBe('12 km/h')
    expect(formatWind(12.4, 'imperial')).toBe('12 mph')
    expect(formatPrecip(1.25, 'metric')).toBe('1.3 mm')
    expect(formatPrecip(1.25, 'imperial')).toBe('1.25 in')
  })
})
