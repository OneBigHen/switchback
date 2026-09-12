"use client"

import { WarningCircle, TrafficCone, CheckCircle } from "@phosphor-icons/react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import "@/app/styles/route-traffic.css"
import {
  fetchRouteTrafficEvidence,
  sampleTrafficRoutePoints,
  summarizeRouteTrafficEvidence,
  type RouteTrafficSummaryView
} from "@/lib/client/route-traffic-client"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RouteTrafficEvidence } from "@/lib/traffic/types"

interface RouteTrafficSummaryProps {
  route: PlannedRoute | null
}

type TrafficResult =
  | { routeId: string; kind: "ready"; evidence: RouteTrafficEvidence }
  | { routeId: string; kind: "unavailable" }

const unavailableSummary: RouteTrafficSummaryView = {
  state: "unavailable",
  title: "Live traffic unavailable",
  detail: "Traffic is not being used to judge this route."
}

function subscribeOnlineState(listener: () => void): () => void {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine
}

function getServerOnlineSnapshot(): boolean {
  return true
}

function SummaryIcon({ state }: { state: RouteTrafficSummaryView["state"] }) {
  if (state === "clear") return <CheckCircle weight="fill" aria-hidden="true" />
  if (state === "danger") return <WarningCircle weight="fill" aria-hidden="true" />
  return <TrafficCone weight="fill" aria-hidden="true" />
}

export function RouteTrafficSummary({ route }: RouteTrafficSummaryProps) {
  const routeId = route?.id ?? null
  const geometry = route?.geometry ?? null
  const points = useMemo(
    () => geometry ? sampleTrafficRoutePoints(geometry) : [],
    [geometry]
  )
  const isOnline = useSyncExternalStore(
    subscribeOnlineState,
    getOnlineSnapshot,
    getServerOnlineSnapshot
  )
  const [result, setResult] = useState<TrafficResult | null>(null)

  useEffect(() => {
    if (!routeId || points.length < 2 || !isOnline) return

    const controller = new AbortController()
    let current = true

    void fetchRouteTrafficEvidence(points, { signal: controller.signal })
      .then((evidence) => {
        if (current) setResult({ routeId, kind: "ready", evidence })
      })
      .catch((caught: unknown) => {
        if (!current || controller.signal.aborted) return
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setResult({ routeId, kind: "unavailable" })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [routeId, points, isOnline])

  if (!routeId) return null
  if (points.length < 2) {
    return (
      <div className="route-traffic-summary is-unavailable" role="status" aria-live="polite">
        <TrafficCone weight="fill" aria-hidden="true" />
        <span>
          <strong>{unavailableSummary.title}</strong>
          <small>{unavailableSummary.detail}</small>
        </span>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="route-traffic-summary is-paused" role="status" aria-live="polite">
        <TrafficCone weight="fill" aria-hidden="true" />
        <span>
          <strong>Traffic check paused</strong>
          <small>Reconnect to refresh live conditions.</small>
        </span>
      </div>
    )
  }

  // A completed result belongs to one route identity. Until this route's own
  // request resolves, an older route's evidence must never flash as current.
  if (!result || result.routeId !== routeId) {
    return (
      <div className="route-traffic-summary is-loading" role="status" aria-live="polite">
        <span className="route-traffic-summary__spinner" aria-hidden="true" />
        <span>
          <strong>Checking live traffic…</strong>
          <small>Current conditions are advisory and do not change your route yet.</small>
        </span>
      </div>
    )
  }

  const summary = result.kind === "ready"
    ? summarizeRouteTrafficEvidence(result.evidence)
    : unavailableSummary

  return (
    <div className={`route-traffic-summary is-${summary.state}`} role="status" aria-live="polite">
      <SummaryIcon state={summary.state} />
      <span>
        <strong>{summary.title}</strong>
        <small>{summary.detail}</small>
      </span>
    </div>
  )
}
