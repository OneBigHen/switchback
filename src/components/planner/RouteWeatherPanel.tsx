"use client"

import {
  ArrowClockwise,
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

      <div className="weather-samples">
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
    </section>
  )
}
