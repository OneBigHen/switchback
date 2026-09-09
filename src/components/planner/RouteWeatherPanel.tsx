"use client"

import {
  ArrowClockwise,
  CaretDown,
  CaretUp,
  CloudSun,
  Drop,
  Warning,
  Wind
} from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import { requestRouteWeather, sampleRouteWeatherPoints } from "@/lib/client/weather-client"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RouteWeatherResponse } from "@/lib/weather/types"

interface RouteWeatherPanelProps {
  route: PlannedRoute
}

export function RouteWeatherPanel({ route }: RouteWeatherPanelProps) {
  const [result, setResult] = useState<{
    key: string
    weather: RouteWeatherResponse | null
    error: string
  } | null>(null)
  const [reload, setReload] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const points = useMemo(() => sampleRouteWeatherPoints(route.geometry), [route.geometry])
  const requestKey = `${route.id}:${reload}`
  const activeResult = result?.key === requestKey ? result : null
  const weather = activeResult?.weather ?? null
  const error = points.length === 0
    ? "Weather is unavailable for this imported route."
    : activeResult?.error ?? ""
  const loading = points.length > 0 && activeResult === null

  useEffect(() => {
    const controller = new AbortController()
    if (points.length === 0) return () => controller.abort()
    void requestRouteWeather(points, fetch, controller.signal)
      .then((response) => {
        setResult({ key: requestKey, weather: response, error: "" })
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setResult({
          key: requestKey,
          weather: null,
          error: caught instanceof Error ? caught.message : "Route weather is temporarily unavailable."
        })
      })
    return () => controller.abort()
  }, [points, requestKey])

  /**
   * What a collapsed panel still owes the rider: the conditions they are
   * actually riding into, without opening anything. The per-location cards
   * below are reference material.
   */
  const summary = useMemo(() => {
    // flatMap rather than map().filter(Boolean): one pass, and the result is
    // narrowed without a non-null assertion on every read below.
    const hours = weather?.samples.flatMap((sample) => sample.hourly[0] ?? []) ?? []
    if (hours.length === 0) return null
    const temperatures = hours
      .flatMap((hour) => (hour.temperatureF === null ? [] : [hour.temperatureF]))
    const rain = hours.map((hour) => hour.precipitationChance ?? 0)
    return {
      // The high is the number that decides a jacket, so it leads.
      temperatureF: temperatures.length > 0 ? Math.max(...temperatures) : null,
      peakRainChance: rain.length > 0 ? Math.max(...rain) : null,
      forecast: hours[0]!.shortForecast
    }
  }, [weather])

  const alerts = useMemo(() => {
    const unique = new Map<string, NonNullable<RouteWeatherResponse["samples"][number]>["alerts"][number]>()
    weather?.samples.forEach((sample) => sample.alerts.forEach((alert) => unique.set(alert.id, alert)))
    return [...unique.values()]
  }, [weather])

  if (loading) {
    return (
      <section className="route-weather is-loading" aria-label="Ride weather">
        <CloudSun aria-hidden="true" />
        <span role="status">Checking weather along this route…</span>
      </section>
    )
  }

  if (!weather || error) {
    return (
      <section className="route-weather is-error" aria-label="Ride weather">
        <span>{error || "Route weather is temporarily unavailable."}</span>
        <button type="button" onClick={() => setReload((value) => value + 1)}>
          <ArrowClockwise aria-hidden="true" /> Retry weather
        </button>
      </section>
    )
  }

  return (
    <section className="route-weather" aria-labelledby="ride-weather-title">
      <header>
        <span><CloudSun weight="fill" aria-hidden="true" /></span>
        <div>
          <h3 id="ride-weather-title">Ride weather</h3>
          <p>Live forecast along your line · NWS</p>
        </div>
      </header>

      {alerts.length > 0 ? (
        <div className="route-alerts" role="alert">
          <Warning weight="fill" aria-hidden="true" />
          <div>
            <strong>{alerts[0].event}</strong>
            <span>{alerts[0].headline}</span>
          </div>
        </div>
      ) : null}

      {summary ? (
        <p className="weather-summary" data-testid="route-weather-summary">
          <strong>{summary.temperatureF === null ? "—" : `${Math.round(summary.temperatureF)}°`}</strong>
          <span>{summary.forecast}</span>
          {summary.peakRainChance === null ? null : <span>{summary.peakRainChance}% rain at peak</span>}
        </p>
      ) : null}

      <button
        type="button"
        className="weather-detail-toggle"
        aria-expanded={detailOpen}
        aria-controls="route-weather-detail"
        onClick={() => setDetailOpen((open) => !open)}
      >
        <span>Hourly detail along the route</span>
        {detailOpen ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
      </button>

      {detailOpen ? (
      <div className="weather-samples" id="route-weather-detail">
        {weather.samples.map((sample, index) => {
          const hour = sample.hourly[0]
          return (
            <article key={`${sample.coordinate.lat}-${sample.coordinate.lon}`}>
              <small>{sample.location?.city || (index === 0 ? "Start" : index === weather.samples.length - 1 ? "Finish" : "Mid-route")}</small>
              {hour ? (
                <>
                  <strong>{hour.temperatureF === null ? "—" : `${Math.round(hour.temperatureF)}°`}</strong>
                  <span className="weather-condition">{hour.shortForecast}</span>
                  <span className="weather-detail"><Drop weight="fill" aria-hidden="true" /> {hour.precipitationChance ?? 0}% rain</span>
                  <span className="weather-detail"><Wind aria-hidden="true" /> {hour.windSpeedMph ?? 0} mph {hour.windDirection}</span>
                </>
              ) : <span className="weather-condition">Forecast unavailable</span>}
            </article>
          )
        })}
      </div>
      ) : null}
    </section>
  )
}
