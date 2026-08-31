"use client"

import { useCallback } from "react"
import { readStoredPlannerLocation, requestPlannerLocation, savePlannerLocation } from "@/lib/client/planner-location"
import { discoverPlaceIdeas, type PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import { buildRideTripRequest, createPlanningId } from "@/lib/planner/ride-plan-request"
import { resolveRidePromptWaypoints, type RideStartLocation, type RideStartLocationSource } from "@/lib/planner/ride-prompt-flow"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { GeocoderBias } from "@/lib/geocoding/photon"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { AvoidArea, RouteProfileId, Waypoint } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"
import type { PlanMode, RideIntentStatus } from "./PlannerDeck"

type PlannerNotice = { kind: "success" | "warning"; message: string }

/** Last-resort inferred start when the browser cannot provide a location. */
const REGION_DEFAULT_START: Waypoint = {
  lat: 40.2732,
  lon: -76.8867,
  label: "Approximate start · Harrisburg area"
}

function startSourceLabel(source: RideStartLocationSource): string {
  switch (source) {
    case "saved": return "your last saved browser location"
    case "home": return "your saved Home"
    case "region": return "the Harrisburg area (approximate)"
    default: return "your current location"
  }
}

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
        requestLocation: async (): Promise<RideStartLocation> => {
          // Try the browser fix first; when it is unavailable or denied,
          // infer a start from what the rider already gave us so the ride
          // still plans: last saved location, saved Home, then the region
          // default. Suggestions like "1-hour loop" should always map
          // something instead of dead-ending on a missing start.
          try {
            const live = await requestPlannerLocation(navigator.geolocation)
            return { waypoint: live, source: "live" }
          } catch {
            // Geolocation unavailable or denied — fall through to inference.
          }
          try {
            const saved = readStoredPlannerLocation(window.localStorage)
            if (saved) return { waypoint: saved, source: "saved" }
          } catch {
            // Private-mode or blocked storage; keep going.
          }
          if (home) return { waypoint: home, source: "home" }
          return { waypoint: REGION_DEFAULT_START, source: "region" }
        }
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
      if (resolved.locationSource === "live") {
        try {
          savePlannerLocation(window.localStorage, resolved.start)
        } catch {
          // Routing can proceed from the fresh fix even when browser storage
          // is unavailable or private-mode restricted.
        }
      } else if (resolved.locationSource) {
        // Inferred start (saved / home / region): tell the rider where the
        // route begins and how to get a precise one.
        const sourceLabel = startSourceLabel(resolved.locationSource)
        setIntentSummary(`Starting from ${sourceLabel}. Enable location access for a precise start.`)
        onNotice({
          kind: "warning",
          message: `Couldn't get a live location, so this ride starts from ${sourceLabel}. Enable location access and plan again for an exact start.`
        })
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
      // Interpretation is complete once the route request is built. Keep the
      // omnibox available for a newer rider prompt while routing is in flight;
      // the planning session gate cancels and discards stale route work.
      setIntentStatus("idle")
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
      const raw = caught instanceof Error ? caught.message : "This ride request could not be interpreted."
      if (/location|start point/i.test(raw)) {
        // Geolocation is unavailable on this connection (e.g. LAN http), so
        // guide the rider to choose the start on the map instead of leaving
        // them with a dead prompt and no plotted route.
        usePlannerStore.getState().armPoint("start")
        const message = "Choose your start point on the map (or type it in the start field), then plan again — location access isn't available on this connection."
        setIntentSummary(message)
        onNotice({ kind: "warning", message })
        return
      }
      setIntentSummary(raw)
      onNotice({ kind: "warning", message: raw })
    }
  }, [avoidAreas, gate, home, nextSeed, onNotice, runTripPlan, segmentProfiles, setAvoidHighways, setIntentStatus, setIntentSummary, setPlanMode, setResearchSources, setStopIdeas, setTargetMinutes, targetMinutes])
}
