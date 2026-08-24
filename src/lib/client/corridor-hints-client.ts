import type { TripPlanRequest } from "@/lib/routing/planner"
import { characterForProfile } from "@/lib/domain/routing/ride-character"

export { characterForProfile }

/**
 * Phase 5 → 4 merge step: background, best-effort corridor-hint refresh.
 *
 * Fired from the alternatives flow (never the primary critical path): posts
 * the same ride intent to the bounded adviser endpoint so its 7-day cache
 * warms for the next plan. The primary path reads that cache locally, so
 * research never blocks routing. Never throws.
 */
export async function refreshCorridorHints(
  request: TripPlanRequest,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  if (request.points.length < 2) return
  if (request.targetMinutes == null) return
  const start = request.points[0]!
  const finish = request.points[request.points.length - 1]!
  try {
    await fetcher("/api/ride-corridors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        start: { lat: start.lat, lon: start.lon, label: start.label },
        finish: { lat: finish.lat, lon: finish.lon, label: finish.label },
        targetMinutes: request.targetMinutes,
        character: characterForProfile(request.profile)
      }),
      signal
    })
  } catch {
    // Background research is optional; never surface cancellation or outage
    // noise to the planner.
  }
}
