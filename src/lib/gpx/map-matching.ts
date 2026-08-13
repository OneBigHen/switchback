export type GpxMapMatchStatus = "not-configured" | "matched" | "unmatched" | "failed" | "cancelled"

export interface GpxMapMatchResult {
  status: GpxMapMatchStatus
  provider: "graphhopper" | null
  profile: string | null
  matchedDistanceMeters?: number
  snappedWaypointCount?: number
  message?: string
}

export interface GpxMapMatchOptions {
  endpoint?: string
  profile?: string
  timeoutMs?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

const MAX_MATCH_PATHS = 16
const MAX_SNAPPED_WAYPOINTS = 50_000

interface GraphHopperMatchPath {
  distance?: unknown
  snapped_waypoints?: unknown
}

interface GraphHopperMatchPayload {
  paths?: unknown
}

function result(
  status: GpxMapMatchStatus,
  options: GpxMapMatchOptions,
  extra: Omit<GpxMapMatchResult, "status" | "provider" | "profile"> = {}
): GpxMapMatchResult {
  const configured = Boolean(options.endpoint?.trim())
  return {
    status,
    provider: configured ? "graphhopper" : null,
    profile: configured ? options.profile?.trim() || "motorcycle_adventure" : null,
    ...extra
  }
}

function bodyStream(source: AsyncIterable<Uint8Array | string>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]()
  const encoder = new TextEncoder()
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) controller.close()
        else controller.enqueue(typeof next.value === "string" ? encoder.encode(next.value) : next.value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
    }
  })
}

function matchUrl(endpoint: string, profile: string): string {
  const url = new URL(endpoint)
  url.searchParams.set("profile", profile)
  url.searchParams.set("type", "json")
  return url.toString()
}

function parsedPaths(payload: unknown): GraphHopperMatchPath[] | null {
  if (!payload || typeof payload !== "object") return null
  const paths = (payload as GraphHopperMatchPayload).paths
  if (!Array.isArray(paths)) return null
  if (paths.length > MAX_MATCH_PATHS) return null
  if (paths.length === 0) return []
  return paths.every((path: unknown) => path && typeof path === "object")
    ? paths as GraphHopperMatchPath[]
    : null
}

export async function mapMatchGpxStream(
  source: AsyncIterable<Uint8Array | string>,
  options: GpxMapMatchOptions = {}
): Promise<GpxMapMatchResult> {
  const endpoint = options.endpoint?.trim()
  if (!endpoint) return result("not-configured", options, { message: "No GraphHopper map-matching endpoint is configured." })
  const profile = options.profile?.trim() || "motorcycle_adventure"
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener("abort", abortFromCaller, { once: true })

  try {
    if (options.signal?.aborted) return result("cancelled", { ...options, endpoint, profile })
    const response = await fetchImpl(matchUrl(endpoint, profile), {
      method: "POST",
      headers: { "content-type": "application/gpx+xml", accept: "application/json" },
      body: bodyStream(source),
      signal: controller.signal,
      duplex: "half"
    } as RequestInit & { duplex: "half" })
    if (!response.ok) {
      return result("failed", { ...options, endpoint, profile }, {
        message: `GraphHopper map matching returned HTTP ${response.status}.`
      })
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return result("failed", { ...options, endpoint, profile }, { message: "GraphHopper map matching returned invalid JSON." })
    }
    const paths = parsedPaths(payload)
    if (!paths) {
      return result("failed", { ...options, endpoint, profile }, { message: "GraphHopper map matching returned no valid paths array." })
    }
    if (paths.length === 0) return result("unmatched", { ...options, endpoint, profile })
    const path = paths[0]!
    const matchedDistanceMeters = typeof path.distance === "number" && Number.isFinite(path.distance)
      ? path.distance
      : null
    if (matchedDistanceMeters === null || matchedDistanceMeters < 0) {
      return result("failed", { ...options, endpoint, profile }, { message: "GraphHopper map matching returned a path without a valid distance." })
    }
    if (Array.isArray(path.snapped_waypoints) && path.snapped_waypoints.length > MAX_SNAPPED_WAYPOINTS) {
      return result("failed", { ...options, endpoint, profile }, { message: "GraphHopper map matching returned too many snapped waypoints." })
    }
    return result("matched", { ...options, endpoint, profile }, {
      matchedDistanceMeters,
      ...(Array.isArray(path.snapped_waypoints) ? { snappedWaypointCount: path.snapped_waypoints.length } : {})
    })
  } catch (error) {
    if (options.signal?.aborted) return result("cancelled", { ...options, endpoint, profile })
    if (controller.signal.aborted) return result("failed", { ...options, endpoint, profile }, { message: "GraphHopper map matching timed out." })
    return result("failed", { ...options, endpoint, profile }, {
      message: error instanceof Error ? error.message : "GraphHopper map matching failed."
    })
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener("abort", abortFromCaller)
  }
}
