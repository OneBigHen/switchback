import { useEffect, useRef, useState } from "react"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import { discoverPlaceIdeas } from "@/lib/client/place-ideas-client"
import type { PlaceResult } from "@/lib/geocoding/photon"

type FuelStopsState = {
  status: "idle" | "loading" | "error" | "ready"
  places: PlaceResult[]
}

interface UseRideFuelDetourOptions {
  routeId: string
  onChooseFuelStop(frame: NavigationFrame, fuelStop: PlaceResult): void
}

export function useRideFuelDetour({ routeId, onChooseFuelStop }: UseRideFuelDetourOptions) {
  const searchAbortRef = useRef<AbortController | null>(null)
  const [fuelStops, setFuelStops] = useState<FuelStopsState>({ status: "idle", places: [] })

  useEffect(() => () => searchAbortRef.current?.abort(), [routeId])

  const findFuel = (frame: NavigationFrame) => {
    const controller = new AbortController()
    searchAbortRef.current?.abort()
    searchAbortRef.current = controller
    setFuelStops({ status: "loading", places: [] })
    void discoverPlaceIdeas("fuel", {
      lat: frame.rawCoordinate[1],
      lon: frame.rawCoordinate[0]
    }, 25, fetch, controller.signal).then((result) => {
      if (searchAbortRef.current !== controller) return
      searchAbortRef.current = null
      setFuelStops(result.places.length > 0
        ? { status: "ready", places: result.places }
        : { status: "error", places: [] })
    }).catch(() => {
      if (searchAbortRef.current !== controller) return
      searchAbortRef.current = null
      setFuelStops({ status: "error", places: [] })
    })
  }

  const selectFuelStop = (frame: NavigationFrame, fuelStop: PlaceResult) => {
    setFuelStops({ status: "idle", places: [] })
    onChooseFuelStop(frame, fuelStop)
  }

  return { fuelStops, findFuel, selectFuelStop }
}
