"use client"

import { useCallback } from "react"
import { requestPlannerLocation, savePlannerLocation } from "@/lib/client/planner-location"
import { discoverPlaceIdeas, type PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import { buildRideTripRequest } from "@/lib/planner/ride-plan-request"
import { resolveRidePromptWaypoints } from "@/lib/planner/ride-prompt-flow"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { GeocoderBias } from "@/lib/geocoding/photon"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlanMode, RideIntentStatus } from "./PlannerDeck"

type PlannerNotice = { kind: "success" | "warning"; message: string }

interface UsePlannerRideIntentOptions {
  gate: LatestRequestGate
  home: Waypoint | null
  targetMinutes: number
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
    gate.invalidate()
    setStopIdeas(null)
    setResearchSources([])
    setIntentStatus("interpreting")
    setIntentSummary("Reading your ride request…")
    try {
      const intent = await requestRideIntent(prompt)
      const current = usePlannerStore.getState()
      const nextMode: PlanMode = intent.mode
      const nextDuration = intent.targetMinutes ?? targetMinutes

      const resolved = await resolveRidePromptWaypoints({
        intent,
        start: current.start,
        finish: current.finish,
        home,
        search: (query, bias) => searchPlacesClient(query, fetch, undefined, bias),
        requestLocation: () => requestPlannerLocation(navigator.geolocation)
      })

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
        targetMinutes: nextDuration,
        seed: nextSeed(),
        via: [],
        avoidHighways: intent.avoidHighways
      })
      setIntentSummary(`Understood: ${intent.summary}${intent.stopQuery ? ` with ${intent.stopQuery} stop ideas to choose from` : ""}.`)
      setIntentStatus("idle")
      const firstPlan = await runTripPlan(request)
      if (intent.stopQuery && firstPlan) {
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
      setIntentStatus("idle")
      const message = caught instanceof Error ? caught.message : "This ride request could not be interpreted."
      setIntentSummary(message)
      onNotice({ kind: "warning", message })
    }
  }, [gate, home, nextSeed, onNotice, runTripPlan, setAvoidHighways, setIntentStatus, setIntentSummary, setPlanMode, setResearchSources, setStopIdeas, setTargetMinutes, targetMinutes])
}
