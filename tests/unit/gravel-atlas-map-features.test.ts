import { describe, expect, it, vi } from "vitest"
import {
  getGravelAtlasMapFeatures,
  getCombinedRiderMapFeatures
} from "@/lib/map-features/gravel-atlas"

const bounds = { west: -75.4, south: 40.0, east: -74.7, north: 40.7 }

const corridor = {
  id: "corridor-1",
  label: "Ridge gravel",
  geometry: [[-75.2, 40.2], [-75.0, 40.3], [-74.9, 40.4]] as [number, number][],
  verifiedGravelMeters: 4200,
  longestContinuousGravelMeters: 3600,
  fragmentCount: 2,
  confidence: 0.91,
  verification: "routable" as const,
  sourceIds: ["njgin:abc", "osm:123"]
}

const baseFeature = {
  type: "Feature" as const,
  properties: { layerId: "fuel", name: "Fuel stop", sourceId: "node-1" },
  geometry: { type: "Point" as const, coordinates: [-75.1, 40.25] as [number, number] }
}

describe("Gravel Atlas viewport features", () => {
  it("queries only the requested viewport against the active graph and source fingerprints", async () => {
    const queryBounds = vi.fn(() => [corridor])

    const result = await getGravelAtlasMapFeatures({
      bounds,
      layers: ["gravel-atlas"]
    }, {
      repository: { queryBounds },
      graphFingerprint: "graph-2026-09-11",
      sourceFingerprint: "a".repeat(64),
      limit: 500
    })

    expect(queryBounds).toHaveBeenCalledWith({
      ...bounds,
      graphFingerprint: "graph-2026-09-11",
      sourceFingerprint: "a".repeat(64),
      limit: 200
    })
    expect(result).toEqual({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          layerId: "gravel-atlas",
          name: "Ridge gravel",
          sourceId: "corridor-1",
          confidence: "0.91",
          verifiedGravelMeters: "4200",
          longestContinuousGravelMeters: "3600",
          fragmentCount: "2",
          evidenceSourceCount: "2"
        },
        geometry: { type: "LineString", coordinates: corridor.geometry }
      }]
    })
  })

  it("does not query the Atlas when the map layer was not requested", async () => {
    const queryBounds = vi.fn(() => [corridor])
    const result = await getGravelAtlasMapFeatures({ bounds, layers: ["fuel"] }, {
      repository: { queryBounds },
      graphFingerprint: "graph-2026-09-11"
    })

    expect(queryBounds).not.toHaveBeenCalled()
    expect(result.features).toEqual([])
  })

  it("keeps Atlas traffic out of Overpass while merging mixed viewport results", async () => {
    const baseProvider = vi.fn(async () => ({ type: "FeatureCollection" as const, features: [baseFeature] }))
    const atlasProvider = vi.fn(async () => ({
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: { layerId: "gravel-atlas", name: "Ridge gravel", sourceId: "corridor-1" },
        geometry: { type: "LineString" as const, coordinates: corridor.geometry }
      }]
    }))

    const result = await getCombinedRiderMapFeatures({ bounds, layers: ["fuel", "gravel-atlas"] }, {
      baseProvider,
      atlasProvider
    })

    expect(baseProvider).toHaveBeenCalledWith({ bounds, layers: ["fuel"] })
    expect(atlasProvider).toHaveBeenCalledWith({ bounds, layers: ["gravel-atlas"] })
    expect(result.features.map((feature) => feature.properties.layerId)).toEqual(["fuel", "gravel-atlas"])
    expect(result.unavailable).toBeUndefined()
  })

  it("does not call the public provider for an Atlas-only viewport request", async () => {
    const baseProvider = vi.fn()
    const atlasProvider = vi.fn(async () => ({ type: "FeatureCollection" as const, features: [] }))

    await getCombinedRiderMapFeatures({ bounds, layers: ["gravel-atlas"] }, { baseProvider, atlasProvider })

    expect(baseProvider).not.toHaveBeenCalled()
    expect(atlasProvider).toHaveBeenCalledOnce()
  })

  it("marks Atlas unavailable without erasing successful public map features", async () => {
    const result = await getCombinedRiderMapFeatures({ bounds, layers: ["fuel", "gravel-atlas"] }, {
      baseProvider: async () => ({ type: "FeatureCollection", features: [baseFeature] }),
      atlasProvider: async () => { throw new Error("atlas database unavailable") }
    })

    expect(result.features).toEqual([baseFeature])
    expect(result.unavailable).toContain("gravel-atlas")
  })

  it("reports an unconfigured Atlas layer as unavailable instead of a confirmed empty area", async () => {
    const result = await getCombinedRiderMapFeatures({ bounds, layers: ["gravel-atlas"] }, {
      baseProvider: vi.fn()
    })

    expect(result.features).toEqual([])
    expect(result.unavailable).toEqual(["gravel-atlas"])
  })

  it("propagates repository graph-build mismatches so Atlas is not misreported as empty", async () => {
    const queryBounds = vi.fn(() => {
      throw new Error("Gravel Atlas runtime database does not match the configured graph fingerprint")
    })

    await expect(getGravelAtlasMapFeatures({ bounds, layers: ["gravel-atlas"] }, {
      repository: { queryBounds },
      graphFingerprint: "graph-2026-09-11",
      sourceFingerprint: "a".repeat(64)
    })).rejects.toThrow(/does not match the configured graph fingerprint/)

    expect(queryBounds).toHaveBeenCalledOnce()
  })

  it("propagates repository source-build mismatches so Atlas is not misreported as empty", async () => {
    const queryBounds = vi.fn(() => {
      throw new Error("Gravel Atlas runtime database does not match the configured source fingerprint")
    })

    await expect(getGravelAtlasMapFeatures({ bounds, layers: ["gravel-atlas"] }, {
      repository: { queryBounds },
      graphFingerprint: "graph-2026-09-11",
      sourceFingerprint: "a".repeat(64)
    })).rejects.toThrow(/does not match the configured source fingerprint/)

    expect(queryBounds).toHaveBeenCalledOnce()
  })

  it("still reports a genuinely empty viewport as empty rather than unavailable", async () => {
    const result = await getGravelAtlasMapFeatures({ bounds, layers: ["gravel-atlas"] }, {
      repository: { queryBounds: () => [] },
      graphFingerprint: "graph-2026-09-11",
      sourceFingerprint: "a".repeat(64)
    })

    expect(result).toEqual({ type: "FeatureCollection", features: [] })
  })

  it("marks a mismatched runtime build unavailable instead of a confirmed empty area", async () => {
    const result = await getCombinedRiderMapFeatures({ bounds, layers: ["gravel-atlas"] }, {
      baseProvider: vi.fn(),
      atlasProvider: (request) => getGravelAtlasMapFeatures(request, {
        repository: {
          queryBounds: () => {
            throw new Error("Gravel Atlas runtime database does not match the configured source fingerprint")
          }
        },
        graphFingerprint: "graph-2026-09-11",
        sourceFingerprint: "a".repeat(64),
        limit: 200
      })
    })

    expect(result.features).toEqual([])
    expect(result.unavailable).toEqual(["gravel-atlas"])
  })
})
