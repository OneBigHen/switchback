import { useCallback } from "react"
import { buildRoadMatchRequest } from "@/lib/planner/road-match-request"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { AvoidArea, PlannedRoute, RouteProfileId } from "@/lib/routing/types"
import type { SavedRoute } from "@/lib/storage/route-library"
import { navigationStore } from "@/stores/navigation-store"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlanMode } from "./PlannerDeck"

interface UsePlannerRideActionsOptions {
  runTripPlan(request: TripPlanRequest): Promise<TripPlan | null>
  invalidateRequests(): void
  setPlanMode(mode: PlanMode): void
  setAvoidAreas(areas: AvoidArea[]): void
  setSegmentProfiles(profiles: RouteProfileId[]): void
  setRideOriginalRoute(route: PlannedRoute): void
  onNotice(notice: { kind: "success" | "warning"; message: string }): void
}

export function usePlannerRideActions({
  runTripPlan,
  invalidateRequests,
  setPlanMode,
  setAvoidAreas,
  setSegmentProfiles,
  setRideOriginalRoute,
  onNotice
}: UsePlannerRideActionsOptions) {
  const roadMatchRoute = useCallback(async (route: PlannedRoute): Promise<PlannedRoute> => {
    const match = buildRoadMatchRequest(route)
    const store = usePlannerStore.getState()
    invalidateRequests()
    store.replaceRoutePoints(match.points)
    store.setProfile(route.profile)
    setPlanMode("destination")
    setAvoidAreas(route.avoidAreas ?? [])
    setSegmentProfiles([])
    const planned = await runTripPlan(match.request)
    const matched = planned?.routes.find((candidate) => candidate.id === planned.selectedRouteId) ?? planned?.routes[0]
    if (!matched || matched.instructions.length === 0) {
      throw new Error("This track could not be converted into turn-by-turn directions.")
    }
    return matched
  }, [invalidateRequests, runTripPlan, setAvoidAreas, setPlanMode, setSegmentProfiles])

  const activateRide = useCallback((route: PlannedRoute) => {
    setRideOriginalRoute(route)
    navigationStore.clear()
    usePlannerStore.getState().selectRoute(route.id)
    usePlannerStore.getState().setSurface("ride")
  }, [setRideOriginalRoute])

  const startRide = useCallback(async (route: PlannedRoute) => {
    if (route.previewOnly) {
      onNotice({ kind: "warning", message: "Create a routed line before starting live guidance." })
      return
    }
    const trackOnly = route.navigationMode === "track-only" ||
      (route.gpxIntelligence != null && route.instructions.length === 0)
    if (route.instructions.length > 0 || trackOnly || route.navigationMode === "continuous-track") {
      activateRide(route)
      if (trackOnly) {
        onNotice({ kind: "success", message: "Track-only guidance ready. Road data is unavailable; the GPX line will not be silently re-routed." })
      }
      return
    }
    onNotice({ kind: "warning", message: "Building turn-by-turn directions from this track…" })
    try {
      activateRide(await roadMatchRoute(route))
    } catch (caught) {
      usePlannerStore.getState().setSurface("planner")
      onNotice({
        kind: "warning",
        message: caught instanceof Error ? caught.message : "This track could not be matched to legal roads."
      })
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
