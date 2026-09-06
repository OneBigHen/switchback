"use client"

import { useCallback, useEffect, useRef } from "react"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import {
  createPlannerLocation,
  readStoredPlannerLocation,
  savePlannerLocation
} from "@/lib/client/planner-location"
import type { Waypoint } from "@/lib/routing/types"
import type { PlannerStatus, PlanningPhase } from "@/stores/planner-store"

type RecoveryStatus = "loading" | "ready" | "restored" | "superseded" | "unavailable" | "invalid" | "conflict"

interface PlannerLocationState {
  /** Draft recovery lifecycle; "loading" means we do not yet know whether a
   *  saved ride is about to arrive. */
  recoveryStatus?: RecoveryStatus
  /** A recovered or authored start point. Location never overwrites one. */
  start: Waypoint | null
  /** True once the rider has made a ride change of their own. */
  canUndoRideChange: boolean
  /** True when an undone change is still waiting to be redone. */
  canRedoRideChange: boolean
  /** The current start-field text; non-empty means the rider is typing/editing. */
  startQuery: string
  /** "idle" when no ride intent/planning session owns the request gate. */
  planningPhase: PlanningPhase
  /** "routing" for the tick between a request starting and its phase landing. */
  status: PlannerStatus
  seedCurrentLocation(location: Waypoint): void
}

interface UsePlannerLocationSeedOptions {
  gate: LatestRequestGate
  getPlanner(): PlannerLocationState
  onSeed(source: "saved" | "live"): void
  /** Re-offers a held fix once draft recovery settles. */
  recoveryStatus?: RecoveryStatus
}

export function usePlannerLocationSeed({ gate, getPlanner, onSeed, recoveryStatus }: UsePlannerLocationSeedOptions) {
  const heldFix = useRef<{ location: Waypoint; source: "saved" | "live" } | null>(null)

  const applyHeldFix = useCallback(() => {
    const held = heldFix.current
    if (!held) return
    const current = getPlanner()
    // Recovery has not settled yet: a saved ride may be one tick away from
    // arriving with its own start. Hold the fix rather than discarding it —
    // dropping it here used to leave a rider with no start at all whenever
    // IndexedDB answered more slowly than the browser's location callback.
    if (current.recoveryStatus === "loading") return
    heldFix.current = null
    // Another tab owns the saved ride; this one is asking the rider to reload,
    // not quietly editing a ride it cannot save.
    if (current.recoveryStatus === "conflict") return
    // A restored ride keeps its authored start. But a restored ride *without*
    // one — and a ride that could not be restored at all — still benefits from
    // a location fix, so recovery status alone never disables seeding.
    if (current.start) return
    // Never clobber the rider's own work: a ride change they made — even one
    // they have since undone and could still redo — or a start query they are
    // still typing must win over a passive GPS fix.
    if (current.canUndoRideChange || current.canRedoRideChange) return
    if (current.startQuery.trim().length > 0) return
    // A ride intent or planning session is in flight: it resolves its own
    // start through requestPlannerLocation and owns the request gate.
    // Seeding now would invalidate that in-flight request — silently
    // dropping the rider's just-submitted prompt and leaving the planner
    // stuck in "interpreting" with no route request ever sent.
    if (current.planningPhase !== "idle" || current.status === "routing") return
    gate.invalidate()
    current.seedCurrentLocation(held.location)
    onSeed(held.source)
  }, [gate, getPlanner, onSeed])

  const offerFix = useCallback((location: Waypoint, source: "saved" | "live") => {
    heldFix.current = { location, source }
    applyHeldFix()
  }, [applyHeldFix])

  useEffect(() => {
    if (!("geolocation" in navigator)) return
    let cancelled = false
    try {
      const saved = readStoredPlannerLocation(window.localStorage)
      if (saved) offerFix(saved, "saved")
    } catch {
      // A permitted live GPS fix can still seed the route when storage is unavailable.
    }
    const requestGrantedLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return
          const location = createPlannerLocation(position.coords.latitude, position.coords.longitude)
          if (!location) return
          try {
            savePlannerLocation(window.localStorage, location)
          } catch {
            // Location can be granted while persistent browser storage is denied.
          }
          offerFix(location, "live")
        },
        () => {
          // Never turn a denied or failed passive fix into a blocking planner error.
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
      )
    }
    if (!("permissions" in navigator)) return () => { cancelled = true }
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (!cancelled && permission.state === "granted") requestGrantedLocation()
    }).catch(() => {
      // Some browsers omit the Permissions API; explicit map controls remain available.
    })
    return () => { cancelled = true }
  }, [offerFix])

  // Recovery settled — apply whatever was held back while it was unknown.
  useEffect(() => { applyHeldFix() }, [applyHeldFix, recoveryStatus])
}
