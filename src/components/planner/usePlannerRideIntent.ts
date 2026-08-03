"use client"

import { useCallback } from "react"
import { requestPlannerLocation, savePlannerLocation } from "@/lib/client/planner-location"
import { discoverPlaceIdeas, type PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import { buildRideTripRequest, createPlanningId } from "@/lib/planner/ride-plan-request"
import { resolveRidePromptWaypoints } from "@/lib/planner/ride-prompt-flow"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { GeocoderBias } from "@/lib/geocoding/photon"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { AvoidArea, RouteProfileId, Waypoint } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlanMode, RideIntentStatus } from "./PlannerDeck"

type PlannerNotice = { kind: "success" | "warning"; message: string }

interface UsePlannerRideIntentOptions {
  gate: LatestRequestGate
  home: Waypoint | null
  targetMinutes: number
  avoidAreas: AvoidArea[]
  segmentProfiles: RouteProfileId[]
  nextSeed(): number
  runTripPlan(request: TripPlanRequest): Promise<TripPlan | null>
  setPlanMode(mode: PlanMode): void
  setTargetMinutes(minutes: number): void
  setAvoidHighways(value: boolean): void
  setStopIdeas(ideas: PlaceIdeasResult | null): void
  setResearchSources(sources: RideResearchSource[]): void
  setIntentStatus(status: RideIntentStatus): void
  setIntentSummary(summary: string | null): void
  onNotice(notice: PlannerNotice): void
}

/**
 * Interprets a rider's natural-language request and commits it only after all
 * required places resolve. Optional stop discovery cannot invalidate the route.
 */
export function usePlannerRideIntent({
  gate,
  home,
  targetMinutes,
  avoidAreas,
  segmentProfiles,
  nextSeed,
  runTripPlan,
  setPlanMode,
  setTargetMinutes,
  setAvoidHighways,
  setStopIdeas,
  setResearchSources,
  setIntentStatus,
  setIntentSummary,
  onNotice
}: UsePlannerRideIntentOptions) {
  return useCallback(async (prompt: string) => {
    const requestId = gate.begin()
    const store = usePlannerStore.getState()
    setStopIdeas(null)
    setResearchSources([])
    setIntentStatus("interpreting")
    setIntentSummary("Reading your ride request…")
    store.setPlanningPhase("interpreting")
    try {
      const intent = await requestRideIntent(prompt)
      if (!gate.isCurrent(requestId)) return
      const current = usePlannerStore.getState()
      const nextMode: PlanMode = intent.mode
      const nextDuration = intent.targetMinutes ?? targetMinutes
      const planningId = createPlanningId()
      store.setPlanningPhase("geocoding")

      const resolved = await resolveRidePromptWaypoints({
        intent,
        start: current.start,
        finish: current.finish,
        home,
        search: (query, bias) => searchPlacesClient(query, fetch, undefined, bias),
        requestLocation: () => requestPlannerLocation(navigator.geolocation)
      })

      // A newer prompt or a manual point/profile edit invalidates this
      // request; committing stale resolution on top of it would clobber
      // the rider's newer work. Abort before any planner mutation.
      if (!gate.isCurrent(requestId)) return

      // Commit prompt-derived planner changes only after every required place
      // has resolved. A failed lookup must not erase the rider's current trip.
      setPlanMode(nextMode)
      setTargetMinutes(nextDuration)
      setAvoidHighways(intent.avoidHighways)
      if (intent.profile !== current.profile) current.setProfile(intent.profile)
      current.clearVia()
      if (resolved.start !== current.start) {
        usePlannerStore.getState().setPoint("start", resolved.start)
      }
      if (resolved.acquiredLocation) {
        try {
          savePlannerLocation(window.localStorage, resolved.start)
        } catch {
          // Routing can proceed from the fresh fix even when browser storage
          // is unavailable or private-mode restricted.
        }
      }
      if (nextMode === "destination" && resolved.finish && resolved.finish !== current.finish) {
        usePlannerStore.getState().setPoint("finish", resolved.finish)
      }

      const request = buildRideTripRequest({
        mode: nextMode,
        start: usePlannerStore.getState().start,
        finish: resolved.finish,
        profile: intent.profile as RouteProfileId,
        bikeProfile: usePlannerStore.getState().bikeProfile,
        roadLocks: usePlannerStore.getState().roadLocks,
        targetMinutes: nextDuration,
        seed: nextSeed(),
        via: [],
        avoidHighways: intent.avoidHighways,
        avoidAreas,
        segmentProfiles: segmentProfiles.length > 0 ? segmentProfiles : undefined,
        tollPolicy: intent.tollPolicy,
        planningId
      })
      setIntentSummary(`Understood: ${intent.summary}${intent.stopQuery ? ` with ${intent.stopQuery} stop ideas to choose from` : ""}.`)
      // The lifecycle phase continues into routing (primary, then
      // alternatives); the routing spinner no longer dies before the slow
      // work starts.
      const firstPlan = await runTripPlan(request)
      if (!firstPlan) return
      // runLatestTripPlan advanced the gate itself while routing; take a
      // fresh token so a manual edit during stop discovery still wins.
      const discoveryId = gate.begin()
      if (intent.stopQuery) {
        const firstRoute = firstPlan.routes.find((route) => route.id === firstPlan.selectedRouteId) ?? firstPlan.routes[0]
        const midpoint = firstRoute?.geometry[Math.floor((firstRoute.geometry.length - 1) / 2)]
        const midpointBias: GeocoderBias | null = midpoint
          ? { lat: midpoint[1], lon: midpoint[0] }
          : null
        if (!midpointBias) {
          onNotice({
            kind: "warning",
            message: "The ride is ready, but Switchback could not identify a route midpoint for stop ideas."
          })
          return
        }
        try {
          const ideas = await discoverPlaceIdeas(intent.stopQuery, midpointBias, 35, fetch, undefined, firstRoute?.geometry ?? [])
          if (!gate.isCurrent(discoveryId)) return
          if (ideas.places.length === 0) {
            onNotice({ kind: "warning", message: `The ride is ready, but no reliable ${intent.stopQuery} stops were found near this line.` })
            return
          }
          setStopIdeas(ideas)
          setIntentSummary(
            ideas.rankedBy === "rider-fit"
              ? "Your ride is ready. Pick a rider-fit stop, balanced across great breweries, parks, and worthwhile breaks."
              : "Your ride is ready. Pick a nearby stop idea, or refine the request."
          )
        } catch {
          onNotice({ kind: "warning", message: "The ride is ready, but stop ideas are temporarily unavailable." })
        }
      }
    } catch (caught) {
      if (!gate.isCurrent(requestId)) return
      usePlannerStore.getState().cancelPlanning()
      setIntentStatus("idle")
      const message = caught instanceof Error ? caught.message : "This ride request could not be interpreted."
      setIntentSummary(message)
      onNotice({ kind: "warning", message })
    }
  }, [avoidAreas, gate, home, nextSeed, onNotice, runTripPlan, segmentProfiles, setAvoidHighways, setIntentStatus, setIntentSummary, setPlanMode, setResearchSources, setStopIdeas, setTargetMinutes, targetMinutes])
}
