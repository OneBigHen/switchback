import type {
  RouteWeatherAlert,
  RouteWeatherCoordinate,
  RouteWeatherHour,
  RouteWeatherLocation,
  RouteWeatherResponse,
  RouteWeatherSample
} from "./types"

export interface NwsWeatherOptions {
  baseUrl?: string
  fetcher?: typeof fetch
  timeoutMs?: number
  userAgent: string
}

const DEFAULT_BASE_URL = "https://api.weather.gov"
const DEFAULT_TIMEOUT_MS = 5_000
const MAX_HOURLY_PERIODS = 12
const MAX_ALERTS = 6

type JsonRecord = Record<string, unknown>

export async function getRouteWeather(
  points: RouteWeatherCoordinate[],
  options: NwsWeatherOptions
): Promise<RouteWeatherResponse> {
  const baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL)
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = normalizeTimeout(options.timeoutMs)
  const samples = await Promise.all(points.map((point) => getWeatherSample(
    normalizeCoordinate(point),
    { baseUrl, fetcher, timeoutMs, userAgent: options.userAgent }
  )))

  return { source: "nws", samples }
}

interface ResolvedOptions {
  baseUrl: URL
  fetcher: typeof fetch
  timeoutMs: number
  userAgent: string
}

async function getWeatherSample(
  coordinate: RouteWeatherCoordinate,
  options: ResolvedOptions
): Promise<RouteWeatherSample> {
  const [forecastResult, alertsResult] = await Promise.allSettled([
    getHourlyForecast(coordinate, options),
    getActiveAlerts(coordinate, options)
  ])
  const unavailable: RouteWeatherSample["unavailable"] = []
  if (forecastResult.status === "rejected") unavailable.push("forecast")
  if (alertsResult.status === "rejected") unavailable.push("alerts")

  return {
    coordinate,
    location: forecastResult.status === "fulfilled" ? forecastResult.value.location : null,
    status: unavailable.length === 0 ? "ok" : "degraded",
    forecastUpdatedAt: forecastResult.status === "fulfilled"
      ? forecastResult.value.forecastUpdatedAt
      : null,
    hourly: forecastResult.status === "fulfilled" ? forecastResult.value.hourly : [],
    alerts: alertsResult.status === "fulfilled" ? alertsResult.value : [],
    unavailable
  }
}

async function getHourlyForecast(
  coordinate: RouteWeatherCoordinate,
  options: ResolvedOptions
): Promise<{
  location: RouteWeatherLocation | null
  forecastUpdatedAt: string | null
  hourly: RouteWeatherHour[]
}> {
  const point = asRecord(await fetchJson(
    serviceUrl(options.baseUrl, `/points/${coordinate.lat},${coordinate.lon}`),
    options
  ))
  const properties = asRecord(point.properties)
  const forecastUrl = readForecastUrl(properties.forecastHourly, options.baseUrl)
  const forecast = asRecord(await fetchJson(forecastUrl, options))
  const forecastProperties = asRecord(forecast.properties)
  if (!Array.isArray(forecastProperties.periods)) throw new Error("Invalid hourly forecast")

  return {
    location: readLocation(properties.relativeLocation),
    forecastUpdatedAt: safeString(forecastProperties.updated, 64),
    hourly: forecastProperties.periods
      .map(normalizeHour)
      .filter((hour): hour is RouteWeatherHour => hour !== null)
      .slice(0, MAX_HOURLY_PERIODS)
  }
}

async function getActiveAlerts(
  coordinate: RouteWeatherCoordinate,
  options: ResolvedOptions
): Promise<RouteWeatherAlert[]> {
  const url = serviceUrl(options.baseUrl, "/alerts/active")
  url.searchParams.set("point", `${coordinate.lat},${coordinate.lon}`)
  const alerts = asRecord(await fetchJson(url, options))
  if (!Array.isArray(alerts.features)) throw new Error("Invalid alerts response")

  return alerts.features
    .map(normalizeAlert)
    .filter((alert): alert is RouteWeatherAlert => alert !== null)
    .slice(0, MAX_ALERTS)
}

async function fetchJson(url: URL, options: ResolvedOptions): Promise<unknown> {
  const response = await options.fetcher(url.toString(), {
    headers: {
      accept: "application/geo+json",
      "user-agent": options.userAgent
    },
    signal: AbortSignal.timeout(options.timeoutMs)
  })
  if (!response.ok) throw new Error(`NWS request failed with ${response.status}`)
  return response.json() as Promise<unknown>
}

function normalizeHour(value: unknown): RouteWeatherHour | null {
  if (!isRecord(value)) return null
  const startTime = safeString(value.startTime, 64)
  if (!startTime) return null
  const temperature = finiteNumber(value.temperature)
  const unit = safeString(value.temperatureUnit, 4)
  const precipitation = isRecord(value.probabilityOfPrecipitation)
    ? finiteNumber(value.probabilityOfPrecipitation.value)
    : null

  return {
    startTime,
    isDaytime: typeof value.isDaytime === "boolean" ? value.isDaytime : false,
    temperatureF: normalizeTemperature(temperature, unit),
    precipitationChance: precipitation === null ? null : clamp(Math.round(precipitation), 0, 100),
    windSpeedMph: readWindSpeed(value.windSpeed),
    windDirection: safeString(value.windDirection, 8),
    shortForecast: safeString(value.shortForecast, 120) ?? "Forecast unavailable"
  }
}

function normalizeAlert(value: unknown): RouteWeatherAlert | null {
  if (!isRecord(value)) return null
  const properties = isRecord(value.properties) ? value.properties : null
  if (!properties) return null
  const id = safeString(value.id, 256) ?? safeString(properties.id, 256)
  const event = safeString(properties.event, 120)
  if (!id || !event) return null

  return {
    id,
    event,
    headline: safeString(properties.headline, 240) ?? event,
    severity: safeString(properties.severity, 32),
    urgency: safeString(properties.urgency, 32),
    certainty: safeString(properties.certainty, 32),
    onset: safeString(properties.onset, 64),
    expires: safeString(properties.expires, 64)
  }
}

function readLocation(value: unknown): RouteWeatherLocation | null {
  if (!isRecord(value) || !isRecord(value.properties)) return null
  const city = safeString(value.properties.city, 80)
  const state = safeString(value.properties.state, 16)
  return city && state ? { city, state } : null
}

function readForecastUrl(value: unknown, baseUrl: URL): URL {
  const forecastUrl = new URL(String(value))
  if (forecastUrl.origin !== baseUrl.origin || !forecastUrl.pathname.startsWith("/gridpoints/")) {
    throw new Error("Invalid NWS forecast URL")
  }
  return forecastUrl
}

function serviceUrl(baseUrl: URL, pathname: string): URL {
  return new URL(pathname, `${baseUrl.origin}/`)
}

function normalizeCoordinate(point: RouteWeatherCoordinate): RouteWeatherCoordinate {
  return {
    lat: Number(point.lat.toFixed(4)),
    lon: Number(point.lon.toFixed(4))
  }
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS
  return clamp(Math.round(timeoutMs as number), 250, 15_000)
}

function normalizeTemperature(value: number | null, unit: string | null): number | null {
  if (value === null) return null
  if (unit === "F") return value
  if (unit === "C") return Math.round((value * 9 / 5 + 32) * 10) / 10
  return null
}

function readWindSpeed(value: unknown): number | null {
  const wind = safeString(value, 40)
  if (!wind) return null
  if (wind.toLowerCase() === "calm") return 0
  const values = wind.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? []
  return values.length > 0 ? Math.max(...values) : null
}

function safeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error("Invalid NWS response")
  return value
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
