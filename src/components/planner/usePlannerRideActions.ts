import { useCallback } from "react"
import { buildRoadMatchRequest } from "@/lib/planner/road-match-request"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import type { SavedRoute } from "@/lib/storage/route-library"
import { navigationStore } from "@/stores/navigation-store"
import { usePlannerStore } from "@/stores/planner-store"
import { telemetry } from "@/lib/telemetry/client"

interface UsePlannerRideActionsOptions {
  runTripPlan(request: TripPlanRequest): Promise<TripPlan | null>
  invalidateRequests(): void
  setRideOriginalRoute(route: PlannedRoute): void
  onNotice(notice: { kind: "success" | "warning"; message: string }): void
  onNavigationStarted?(route: PlannedRoute): void
}

export function usePlannerRideActions({
  runTripPlan,
  invalidateRequests,
  setRideOriginalRoute,
  onNotice,
  onNavigationStarted
}: UsePlannerRideActionsOptions) {
  const roadMatchRoute = useCallback(async (route: PlannedRoute): Promise<PlannedRoute> => {
    const match = buildRoadMatchRequest(route)
    const store = usePlannerStore.getState()
    invalidateRequests()
    // Adopting a recorded track is one ride change, not five: points, road
    // feel, mode and constraints move together or the planner would briefly
    // hold a ride nobody asked for.
    store.editRide({
      ...match.points,
      mode: "destination",
      profile: route.profile,
      avoidAreas: route.avoidAreas ?? [],
      segmentProfiles: []
    }, "Followed a recorded track", "import")
    const planned = await runTripPlan(match.request)
    const matched = planned?.routes.find((candidate) => candidate.id === planned.selectedRouteId) ?? planned?.routes[0]
    if (!matched || matched.instructions.length === 0) {
      throw new Error("This track could not be converted into turn-by-turn directions.")
    }
    return matched
  }, [invalidateRequests, runTripPlan])

  const activateRide = useCallback((route: PlannedRoute) => {
    setRideOriginalRoute(route)
    navigationStore.clear()
    usePlannerStore.getState().selectRoute(route.id)
    usePlannerStore.getState().setSurface("ride")
    try {
      onNavigationStarted?.(route)
    } catch {
      // Observability must not prevent live guidance from opening.
    }
  }, [onNavigationStarted, setRideOriginalRoute])

  const startRide = useCallback(async (route: PlannedRoute): Promise<boolean> => {
    try {
      telemetry.capture("primary_action_invoked", {
        surface: "plan",
        control: "unknown",
        action: "start-ride"
      })
    } catch {
      // Starting a ride must remain available when observability is blocked.
    }
    if (route.previewOnly) {
      onNotice({ kind: "warning", message: "Create a routed line before starting live guidance." })
      return false
    }
    const trackOnly = route.navigationMode === "track-only" ||
      (route.gpxIntelligence != null && route.instructions.length === 0)
    if (route.instructions.length > 0 || trackOnly || route.navigationMode === "continuous-track") {
      activateRide(route)
      if (trackOnly) {
        onNotice({ kind: "success", message: "Track-only guidance ready. Road data is unavailable; the GPX line will not be silently re-routed." })
      }
      return true
    }
    onNotice({ kind: "warning", message: "Building turn-by-turn directions from this track…" })
    try {
      activateRide(await roadMatchRoute(route))
      return true
    } catch (caught) {
      usePlannerStore.getState().setSurface("planner")
      onNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "This track could not be matched to legal roads."
      })
      return false
    }
  }, [activateRide, onNotice, roadMatchRoute])

  const matchImported = useCallback(async (route: SavedRoute) => {
    try {
      await roadMatchRoute(route)
      usePlannerStore.getState().setSurface("planner")
      onNotice({
        kind: "success",
        message: "Road-matched copy created. Your imported track remains unchanged in the library."
      })
    } catch (caught) {
      onNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "Imported track could not be matched to legal roads."
      })
    }
  }, [onNotice, roadMatchRoute])

  return { startRide, matchImported }
}
