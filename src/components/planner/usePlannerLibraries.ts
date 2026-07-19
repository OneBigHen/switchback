"use client"

import { useCallback, useEffect, useState } from "react"
import { MapPackLibrary } from "@/lib/storage/map-pack-library"
import { RideJournalLibrary, type RecordedRide } from "@/lib/storage/ride-journal"
import { RouteLibrary, type SavedRoute } from "@/lib/storage/route-library"
import type { RiderMapPack } from "@/lib/client/map-layers"

interface UsePlannerLibrariesOptions {
  onWarning(message: string): void
}

export function usePlannerLibraries({ onWarning }: UsePlannerLibrariesOptions) {
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [mapPacks, setMapPacks] = useState<RiderMapPack[]>([])
  const [recordedRides, setRecordedRides] = useState<RecordedRide[]>([])
  const [routeLibrary] = useState(() => new RouteLibrary())
  const [mapPackLibrary] = useState(() => new MapPackLibrary())
  const [rideJournalLibrary] = useState(() => new RideJournalLibrary())

  const refreshRoutes = useCallback(async () => {
    setSavedRoutes(await routeLibrary.list())
  }, [routeLibrary])
  const refreshMapPacks = useCallback(async () => {
    setMapPacks(await mapPackLibrary.list())
  }, [mapPackLibrary])
  const refreshRideJournal = useCallback(async () => {
    setRecordedRides(await rideJournalLibrary.list())
  }, [rideJournalLibrary])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshRoutes().catch(() => onWarning("The local route library could not be opened."))
      void refreshMapPacks().catch(() => onWarning("Saved map packs could not be opened on this device."))
      void refreshRideJournal().catch(() => {
        // Ride replay is optional when browser storage is unavailable.
      })
    })
  }, [onWarning, refreshMapPacks, refreshRideJournal, refreshRoutes])

  return {
    savedRoutes,
    mapPacks,
    recordedRides,
    routeLibrary,
    mapPackLibrary,
    rideJournalLibrary,
    refreshRoutes,
    refreshMapPacks,
    refreshRideJournal
  }
}
