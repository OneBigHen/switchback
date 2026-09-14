import { cleanup, renderHook, waitFor } from "@testing-library/react"
import type { Map as MapLibreMap } from "maplibre-gl"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useRiderFeatureLayers, type RiderFeatureLiveProps } from "@/components/planner/workspace/use-rider-feature-layers"
import type { RiderLayerSetting } from "@/lib/client/map-layers"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function fakeMap(): MapLibreMap {
  return {
    getZoom: () => 12,
    getBounds: () => ({ getSouth: () => 40.2, getWest: () => -75.2, getNorth: () => 40.3, getEast: () => -75.1 }),
    getSource: () => ({ setData: vi.fn() }),
    on: vi.fn(),
    off: vi.fn()
  } as unknown as MapLibreMap
}

describe("rider map overlays (#131)", () => {
  it("fetches the current view as soon as a layer is turned on, without a map move", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ type: "FeatureCollection", features: [] }))
    vi.stubGlobal("fetch", fetcher)
    const mapRef = { current: fakeMap() }
    // The caller refreshes this ref after the hook's effects run, so on the
    // toggle render it still describes the layer as hidden.
    const staleLive = { current: { curvatureVisible: false, unpavedVisible: false, riderLayers: [], rideMode: false } satisfies RiderFeatureLiveProps }
    const hidden: RiderLayerSetting[] = []
    const shown: RiderLayerSetting[] = [{ id: "fuel", visible: true, opacity: 1, order: 0 }]

    const { rerender } = renderHook(
      ({ riderLayers }) => useRiderFeatureLayers(mapRef, true, staleLive, { curvatureVisible: false, unpavedVisible: false, riderLayers }),
      { initialProps: { riderLayers: hidden } }
    )
    expect(fetcher).not.toHaveBeenCalled()

    rerender({ riderLayers: shown })

    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/map-features?"), expect.anything()))
    expect(String(fetcher.mock.calls[0]![0])).toContain("layers=fuel")
  })
})
