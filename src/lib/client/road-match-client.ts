import type { RoadMatchResult } from "@/lib/roads/road-matching"

interface RoadMatchingErrorPayload {
  error?: { code?: string; message?: string }
}

export interface RoadMatchClientOptions {
  fetcher?: typeof fetch
  timeoutMs?: number
}

export interface RoadMatchInput {
  start: { lat: number; lon: number; label?: string }
  end: { lat: number; lon: number; label?: string }
  profile?: string
  avoidHighways?: boolean
  bikeProfile?: {
    category: string
    allowMaintainedGravel: boolean
    allowRoughTracks: boolean
    avoidUnknownSurface: boolean
  }
}

/**
 * Graph-match two corridor anchors onto the live routing graph (SB-013).
 * Returns a typed refusal on any failure (router down, no legal path, out of
 * coverage) so the lock UI can fall back to an approximate lock instead of
 * silently claiming a verified graph match.
 */
export async function requestRoadMatch(
  input: RoadMatchInput,
  options: RoadMatchClientOptions = {}
): Promise<RoadMatchResult> {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = options.timeoutMs ?? 20_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetcher("/api/road-matching", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal
    })
  } catch (caught) {
    const aborted = caught !== null && typeof caught === "object"
      && (caught as { name?: unknown }).name === "AbortError"
    throw new Error(aborted
      ? "Road matching timed out; the routing service may be busy."
      : "Road matching is unavailable right now.")
  } finally {
    clearTimeout(timer)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("Road matching returned an unreadable response.")
  }

  const result = payload && typeof payload === "object" && "matched" in payload
    ? (payload as { matched?: unknown }).matched
    : payload
  if (!response.ok || !result || typeof result !== "object" || !("edgeIds" in result)) {
    const errorPayload = payload && typeof payload === "object"
      ? payload as RoadMatchingErrorPayload
      : null
    const message = errorPayload && "error" in errorPayload && errorPayload.error?.message
      ? errorPayload.error.message
      : "No legal motorcycle path could be matched between these points."
    throw new Error(message)
  }
  return result as RoadMatchResult
}
