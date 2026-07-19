import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readPlannerHome } from "@/lib/client/planner-location"
import { usePlannerHome } from "@/components/planner/usePlannerHome"

const home = { lat: 40.273246, lon: -76.886735, label: "Garage" }

describe("usePlannerHome", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it("persists an explicit Home locally and uses it as a new route start", () => {
    const invalidateRequests = vi.fn()
    const setStart = vi.fn()
    const onNotice = vi.fn()
    const { result } = renderHook(() => usePlannerHome({ invalidateRequests, setStart, onNotice }))

    act(() => result.current.saveHome(home))

    expect(result.current.home).toEqual({ ...home, label: "Home" })
    expect(readPlannerHome(window.localStorage)).toEqual({ ...home, label: "Home" })
    expect(onNotice).toHaveBeenLastCalledWith({ kind: "success", message: "Home saved only in this browser." })

    act(() => result.current.useHome())

    expect(invalidateRequests).toHaveBeenCalledOnce()
    expect(setStart).toHaveBeenCalledWith({ ...home, label: "Home" })
  })

  it("removes Home locally even when storage removal is unavailable", () => {
    const onNotice = vi.fn()
    const { result } = renderHook(() => usePlannerHome({
      invalidateRequests: vi.fn(),
      setStart: vi.fn(),
      onNotice
    }))
    act(() => result.current.saveHome(home))
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked")
    })

    act(() => result.current.clearHome())

    expect(result.current.home).toBeNull()
    expect(onNotice).toHaveBeenLastCalledWith({ kind: "success", message: "Saved Home removed from this browser." })
  })
})
