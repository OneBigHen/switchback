import type { RouteCandidateEnricher } from "./planner-contract"
import type { PlannedRoute } from "./types"
import { composeSignals, createDeadline } from "./deadline"
import { mergeRouteWarnings } from "./route-warnings"

/** Elevation is evidence for a finished candidate; it never holds up the answer for long. */
export const ELEVATION_ENRICHMENT_TIMEOUT_MS = 4_000

function preserveRouteWarnings(
  originalRoutes: readonly PlannedRoute[],
  routes: PlannedRoute[]
): PlannedRoute[] {
  const warningsById = new Map(originalRoutes.map((route) => [route.id, route.warnings]))
  return routes.map((route, index) => {
    const warnings = mergeRouteWarnings(
      warningsById.get(route.id),
      originalRoutes[index]?.warnings,
      route.warnings
    )
    return warnings.length > 0 ? { ...route, warnings } : route
  })
}

export interface CandidateEnricherOptions {
  /** Region evidence (PASDA unpaved roads) for accepted candidates. */
  regionEvidence: RouteCandidateEnricher
  /** Elevation lookup; omitted when no elevation service is configured. */
  elevate?: (
    result: { routes: PlannedRoute[]; warnings?: string[] },
    signal: AbortSignal
  ) => Promise<{ routes: PlannedRoute[]; warnings?: string[] }>
  /** The HTTP request's signal; elevation also stops at its own timeout. */
  signal: AbortSignal
}

/**
 * Enrichment for routes the planner has already accepted.
 *
 * Elevation used to be fetched inside the provider, for every path of every
 * comparison profile before any was filtered out, and it waited on the HTTP
 * request rather than the alternatives deadline. Here it runs only for accepted
 * alternatives, never on the primary, and gives up after a short timeout.
 */
export function createCandidateEnricher({ regionEvidence, elevate, signal }: CandidateEnricherOptions): RouteCandidateEnricher {
  return async (request, routes, options) => {
    const lifecycle = composeSignals(signal, options?.signal)
    if (lifecycle.signal.aborted) {
      const reason = lifecycle.signal.reason ?? new DOMException("Route enrichment was cancelled.", "AbortError")
      lifecycle.dispose()
      throw reason
    }
    try {
      const regionEnriched = await regionEvidence(request, routes, { signal: lifecycle.signal })
      const enriched = {
        ...regionEnriched,
        routes: preserveRouteWarnings(routes, regionEnriched.routes)
      }
      if (!elevate || request.candidateSet !== "alternatives" || enriched.routes.length === 0) return enriched
      const elevationDeadline = createDeadline(ELEVATION_ENRICHMENT_TIMEOUT_MS, lifecycle.signal)
      try {
        const elevated = await elevate(enriched, elevationDeadline.signal)
        return {
          routes: preserveRouteWarnings(enriched.routes, elevated.routes),
          warnings: elevated.warnings ?? enriched.warnings
        }
      } catch (reason) {
        if (lifecycle.signal.aborted) throw reason
        return {
          routes: enriched.routes,
          warnings: [...enriched.warnings, "Elevation enrichment unavailable; route geometry was preserved."]
        }
      } finally {
        elevationDeadline.dispose()
      }
    } finally {
      lifecycle.dispose()
    }
  }
}
