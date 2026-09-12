"use client"

import { WarningCircle, TrafficCone, CheckCircle } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
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

type TrafficUiState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; evidence: RouteTrafficEvidence }
  | { kind: "unavailable" }

const unavailableSummary: RouteTrafficSummaryView = {
  state: "unavailable",
  title: "Live traffic unavailable",
  detail: "Traffic is not being used to judge this route."
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
  const [state, setState] = useState<TrafficUiState>({ kind: "idle" })

  useEffect(() => {
    if (!routeId || points.length < 2) {
      setState({ kind: "idle" })
      return
    }

    const controller = new AbortController()
    let current = true
    setState({ kind: "loading" })

    void fetchRouteTrafficEvidence(points, { signal: controller.signal })
      .then((evidence) => {
        if (current) setState({ kind: "ready", evidence })
      })
      .catch((caught: unknown) => {
        if (!current || controller.signal.aborted) return
        if (caught instanceof DOMException && caught.name === "AbortError") return
        setState({ kind: "unavailable" })
      })

    return () => {
      current = false
      controller.abort()
    }
  }, [routeId, points])

  if (!routeId || state.kind === "idle") return null

  if (state.kind === "loading") {
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

  const summary = state.kind === "ready"
    ? summarizeRouteTrafficEvidence(state.evidence)
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
