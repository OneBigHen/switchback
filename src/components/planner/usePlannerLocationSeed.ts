"use client"

import { useEffect } from "react"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import {
  createPlannerLocation,
  readStoredPlannerLocation,
  savePlannerLocation
} from "@/lib/client/planner-location"
import type { Waypoint } from "@/lib/routing/types"

interface PlannerLocationState {
  routePointPast: unknown[]
  /** The current start-field text; non-empty means the rider is typing/editing. */
  startQuery: string
  seedCurrentLocation(location: Waypoint): void
}

interface UsePlannerLocationSeedOptions {
  gate: LatestRequestGate
  getPlanner(): PlannerLocationState
  onSeed(source: "saved" | "live"): void
}

export function usePlannerLocationSeed({ gate, getPlanner, onSeed }: UsePlannerLocationSeedOptions) {
  useEffect(() => {
    if (!("geolocation" in navigator)) return
    let cancelled = false
    const seedLocation = (location: Waypoint, source: "saved" | "live") => {
      const current = getPlanner()
      // Never clobber the rider's own work: an edited start (undo stack) or
      // a start query they are still typing must win over a late passive GPS
      // fix arriving from the initial mount.
      if (current.routePointPast.length > 0 || current.startQuery.trim().length > 0) return
      gate.invalidate()
      current.seedCurrentLocation(location)
      onSeed(source)
    }
    try {
      const saved = readStoredPlannerLocation(window.localStorage)
      if (saved) seedLocation(saved, "saved")
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
          seedLocation(location, "live")
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
  }, [gate, getPlanner, onSeed])
}
