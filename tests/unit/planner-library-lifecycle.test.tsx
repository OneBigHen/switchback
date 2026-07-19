import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { usePlannerLibraries } from "@/components/planner/usePlannerLibraries"

const routeList = vi.fn()
const packList = vi.fn()
const rideList = vi.fn()

vi.mock("@/lib/storage/route-library", () => ({
  RouteLibrary: class RouteLibrary {
    list = routeList
  }
}))
vi.mock("@/lib/storage/map-pack-library", () => ({
  MapPackLibrary: class MapPackLibrary {
    list = packList
  }
}))
vi.mock("@/lib/storage/ride-journal", () => ({
  RideJournalLibrary: class RideJournalLibrary {
    list = rideList
  }
}))

describe("planner library lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    routeList.mockReset()
    packList.mockReset()
    rideList.mockReset()
  })

  it("hydrates each local library independently and exposes refresh operations", async () => {
    routeList.mockResolvedValue([{ id: "saved" }])
    packList.mockResolvedValue([{ id: "pack" }])
    rideList.mockResolvedValue([{ id: "ride" }])
    const onWarning = vi.fn()

    const { result } = renderHook(() => usePlannerLibraries({ onWarning }))

    await waitFor(() => expect(result.current.savedRoutes).toEqual([{ id: "saved" }]))
    expect(result.current.mapPacks).toEqual([{ id: "pack" }])
    expect(result.current.recordedRides).toEqual([{ id: "ride" }])
    expect(onWarning).not.toHaveBeenCalled()

    routeList.mockResolvedValue([{ id: "saved-next" }])
    await result.current.refreshRoutes()
    await waitFor(() => expect(result.current.savedRoutes).toEqual([{ id: "saved-next" }]))
  })

  it("reports route and map-pack storage failures without blocking ride history hydration", async () => {
    routeList.mockRejectedValue(new Error("blocked"))
    packList.mockRejectedValue(new Error("blocked"))
    rideList.mockResolvedValue([{ id: "ride" }])
    const onWarning = vi.fn()

    const { result } = renderHook(() => usePlannerLibraries({ onWarning }))

    await waitFor(() => expect(onWarning).toHaveBeenCalledTimes(2))
    expect(onWarning).toHaveBeenCalledWith("The local route library could not be opened.")
    expect(onWarning).toHaveBeenCalledWith("Saved map packs could not be opened on this device.")
    expect(result.current.recordedRides).toEqual([{ id: "ride" }])
  })
})
