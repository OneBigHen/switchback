import type { Coordinate } from "@/lib/routing/types"

export interface GraphHopperProbeOptions {
  baseUrl: string
  profile: string
  fetcher?: typeof fetch
  /** Per-request deadline; a stalled router must fail the run, not hang it. */
  timeoutMs?: number
}

export interface GraphHopperProbe {
  /** Metres from the point to the routable network, or null when GraphHopper cannot snap it. */
  snapDistance(point: Coordinate): Promise<number | null>
  /** The routed path through the points, or null when GraphHopper answers that no route exists. */
  routeAlong(points: Coordinate[]): Promise<{ meters: number; coordinates: Coordinate[] } | null>
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Live-router access for Gravel Atlas traversability verification.
 *
 * Only a real routing answer may quarantine a corridor. GraphHopper answers
 * "no connection" / "point not found" with 400, which is evidence. Rate limits,
 * server errors, timeouts and dropped connections are not evidence about the
 * corridor: they throw so the verification run aborts before writing output.
 */
export function createGraphHopperProbe(options: GraphHopperProbeOptions): GraphHopperProbe {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const baseUrl = options.baseUrl.replace(/\/+$/, "")

  const request = async (url: string, init: RequestInit = {}): Promise<Response | null> => {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    if (response.ok) return response
    if (response.status === 400) return null
    throw new Error(`GraphHopper verification request failed with HTTP ${response.status}; refusing to record corridor evidence`)
  }

  return {
    async snapDistance(point) {
      const response = await request(`${baseUrl}/nearest?profile=${encodeURIComponent(options.profile)}&point=${point[1]},${point[0]}`)
      if (!response) return null
      const body = await response.json() as { distance?: unknown }
      return typeof body.distance === "number" ? body.distance : null
    },
    async routeAlong(points) {
      const response = await request(`${baseUrl}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: options.profile,
          points: points.map((point) => [point[0], point[1]]),
          points_encoded: false,
          instructions: false
        })
      })
      if (!response) return null
      const body = await response.json() as { paths?: Array<{ distance?: unknown; points?: { coordinates?: unknown } }> }
      const path = body.paths?.[0]
      if (!path || typeof path.distance !== "number") return null
      const coordinates = path.points?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null
      return { meters: path.distance, coordinates: coordinates as Coordinate[] }
    }
  }
}
