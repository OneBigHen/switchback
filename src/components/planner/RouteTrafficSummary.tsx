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

// Route selection can churn while alternatives settle or a saved route briefly
// passes through the preparation surface. Delay provider work long enough for
// those transient selections to disappear, while keeping a stable selection
// responsive to the rider.
const ROUTE_TRAFFIC_SELECTION_SETTLE_MS = 300

const malformedRouteSummary: RouteTrafficSummaryView = {
  state: "unavailable",
  title: "Traffic check unavailable",
  detail: "This route does not have enough geometry for a live traffic check."
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

    let current = true
    let controller: AbortController | null = null
    const settleTimer = window.setTimeout(() => {
      if (!current) return
      controller = new AbortController()

      void fetchRouteTrafficEvidence(points, { signal: controller.signal })
        .then((evidence) => {
          if (current) setResult({ routeId, kind: "ready", evidence })
        })
        .catch((caught: unknown) => {
          if (!current || controller?.signal.aborted) return
          if (caught instanceof DOMException && caught.name === "AbortError") return
          setResult({ routeId, kind: "unavailable" })
        })
    }, ROUTE_TRAFFIC_SELECTION_SETTLE_MS)

    return () => {
      current = false
      window.clearTimeout(settleTimer)
      controller?.abort()
    }
  }, [routeId, points, isOnline])

  if (!routeId) return null
  if (points.length < 2) {
    return (
      <div className="route-traffic-summary is-unavailable" role="status" aria-live="polite">
        <TrafficCone weight="fill" aria-hidden="true" />
        <span>
          <strong>{malformedRouteSummary.title}</strong>
          <small>{malformedRouteSummary.detail}</small>
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
          <small>Advisory only — this does not change the selected route.</small>
        </span>
      </div>
    )
  }

  // Route choice should contain useful evidence, not a permanent provider
  // availability card. Explicit map-layer requests still expose provider
  // failure state through Rider Map Studio.
  if (result.kind === "unavailable" || result.evidence.status === "unknown") return null

  const summary = summarizeRouteTrafficEvidence(result.evidence)

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
