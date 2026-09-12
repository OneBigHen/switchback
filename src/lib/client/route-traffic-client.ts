import type { Coordinate } from "@/lib/routing/types"
import type {
  RouteTrafficEvidence,
  TrafficIncidentEvidence,
  TrafficIncidentGeometry,
  TrafficIncidentKind,
  TrafficRoutePoint
} from "@/lib/traffic/types"

const DEFAULT_MAX_TRAFFIC_POINTS = 400
const TRAFFIC_STATUSES = new Set(["available", "degraded", "unknown"])
const INCIDENT_KINDS = new Set<TrafficIncidentKind>([
  "accident",
  "jam",
  "closure",
  "roadworks",
  "weather",
  "breakdown",
  "hazard",
  "other"
])

export interface RouteTrafficRequestOptions {
  fetcher?: typeof fetch
  signal?: AbortSignal
}

export interface RouteTrafficSummaryView {
  state: "clear" | "warning" | "danger" | "unavailable"
  title: string
  detail: string
}

export function sampleTrafficRoutePoints(
  geometry: readonly Coordinate[],
  maxPoints = DEFAULT_MAX_TRAFFIC_POINTS
): TrafficRoutePoint[] {
  if (geometry.length === 0 || maxPoints < 2) return []

  const toPoint = (coordinate: Coordinate): TrafficRoutePoint => ({
    lat: coordinate[1],
    lon: coordinate[0]
  })

  if (geometry.length <= maxPoints) return geometry.map(toPoint)

  const sampled: TrafficRoutePoint[] = []
  const finalIndex = geometry.length - 1
  for (let slot = 0; slot < maxPoints; slot += 1) {
    const index = Math.floor((slot * finalIndex) / (maxPoints - 1))
    sampled.push(toPoint(geometry[index]!))
  }
  return sampled
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
}

function isIncidentGeometry(value: unknown): value is TrafficIncidentGeometry {
  if (typeof value !== "object" || value === null) return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  if (geometry.type === "Point") return isCoordinatePair(geometry.coordinates)
  if (geometry.type === "LineString") {
    return Array.isArray(geometry.coordinates)
      && geometry.coordinates.length > 0
      && geometry.coordinates.every(isCoordinatePair)
  }
  return false
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNonnegative(value)
}

function isTrafficIncident(value: unknown): value is TrafficIncidentEvidence {
  if (typeof value !== "object" || value === null) return false
  const incident = value as Record<string, unknown>
  return typeof incident.id === "string"
    && incident.id.length > 0
    && typeof incident.kind === "string"
    && INCIDENT_KINDS.has(incident.kind as TrafficIncidentKind)
    && typeof incident.providerCategory === "string"
    && isNullableString(incident.magnitude)
    && isNullableString(incident.description)
    && isNullableNumber(incident.delaySeconds)
    && isNullableNumber(incident.lengthMeters)
    && Array.isArray(incident.roadNumbers)
    && incident.roadNumbers.every((road) => typeof road === "string")
    && isNullableString(incident.from)
    && isNullableString(incident.to)
    && (incident.geometry === null || isIncidentGeometry(incident.geometry))
}

function isRouteTrafficEvidence(value: unknown): value is RouteTrafficEvidence {
  if (typeof value !== "object" || value === null) return false
  const evidence = value as Record<string, unknown>
  return evidence.provider === "tomtom"
    && typeof evidence.status === "string"
    && TRAFFIC_STATUSES.has(evidence.status)
    && typeof evidence.observedAt === "string"
    && evidence.observedAt.length > 0
    && (evidence.totalDelaySeconds === null || isFiniteNonnegative(evidence.totalDelaySeconds))
    && typeof evidence.hasClosure === "boolean"
    && Array.isArray(evidence.incidents)
    && evidence.incidents.every(isTrafficIncident)
}

export async function fetchRouteTrafficEvidence(
  points: readonly TrafficRoutePoint[],
  options: RouteTrafficRequestOptions = {}
): Promise<RouteTrafficEvidence> {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher("/api/route-traffic", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ points }),
    signal: options.signal
  })

  if (!response.ok) throw new Error("Route traffic request failed")
  const payload = await response.json() as unknown
  if (!isRouteTrafficEvidence(payload)) throw new Error("Invalid traffic response")
  return payload
}

function incidentCountLabel(count: number): string {
  return `${count} reported ${count === 1 ? "incident" : "incidents"}`
}

export function summarizeRouteTrafficEvidence(evidence: RouteTrafficEvidence): RouteTrafficSummaryView {
  const incidentCount = evidence.incidents.length

  if (evidence.status === "unknown") {
    return {
      state: "unavailable",
      title: "Live traffic unavailable",
      detail: "Traffic is not being used to judge this route."
    }
  }

  if (evidence.hasClosure || evidence.incidents.some((incident) => incident.kind === "closure")) {
    return {
      state: "danger",
      title: "Closure reported",
      detail: incidentCountLabel(incidentCount)
    }
  }

  if (evidence.status === "degraded") {
    return {
      state: "warning",
      title: "Partial traffic coverage",
      detail: incidentCountLabel(incidentCount)
    }
  }

  if (incidentCount === 0) {
    return {
      state: "clear",
      title: "No reported incidents on this route",
      detail: "Live traffic checked just now"
    }
  }

  if (evidence.totalDelaySeconds !== null && evidence.totalDelaySeconds > 0) {
    const delayMinutes = Math.max(1, Math.round(evidence.totalDelaySeconds / 60))
    return {
      state: "warning",
      title: `${delayMinutes} min traffic delay`,
      detail: incidentCountLabel(incidentCount)
    }
  }

  return {
    state: "warning",
    title: incidentCountLabel(incidentCount),
    detail: "No reliable delay estimate is available."
  }
}
