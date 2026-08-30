import { describe, expect, it } from "vitest"
import {
  allProvenanceRecords,
  provenanceForLayer,
  provenanceRecord,
  provenanceSummary,
  verifyProvenance
} from "@/lib/client/map-data-provenance"
import { type RiderLayerDefinition, layerCatalog } from "@/lib/client/map-layers"

describe("map data provenance", () => {
  it("produces a provenance record for every catalog entry", () => {
    const records = allProvenanceRecords()
    expect(records).toHaveLength(layerCatalog.length)

    for (const record of records) {
      expect(record.provenance.length).toBeGreaterThan(20)
      expect(record.dataCategory.length).toBeGreaterThan(0)
      expect(typeof record.approximate).toBe("boolean")
    }
  })

  it("returns a usable provenance record for a known layer id", () => {
    const record = provenanceForLayer("curvature")
    expect(record).not.toBeNull()
    expect(record!.name).toBe("Great roads")
    expect(record!.dataCategory).toBe("road-geometry")
    expect(record!.approximate).toBe(true)
  })

  it("flags heuristic layers as approximate", () => {
    const heuristic = layerCatalog.filter((layer) => {
      const record = provenanceRecord(layer)
      return (
        record.approximate &&
        layer.provenance.toLowerCase().includes("community-mapped")
      )
    })
    expect(heuristic.length).toBeGreaterThan(5)
  })

  it("does not flag government-published data as approximate", () => {
    const pasda = provenanceForLayer("unpaved")
    expect(pasda).not.toBeNull()
    expect(pasda!.approximate).toBe(false)
    expect(pasda!.provenance).toContain("Government-published")
  })

  it("returns null for an unknown layer id", () => {
    expect(provenanceForLayer("nonexistent" as never)).toBeNull()
  })

  it("builds an accurate provenance summary", () => {
    const summary = provenanceSummary()

    expect(summary.layers).toBe(layerCatalog.length)
    expect(summary.live + summary.regional + summary.planned).toBe(summary.layers)
    expect(summary.authoritative).toBeGreaterThan(0)
    expect(summary.authoritative + summary.heuristic).toBeLessThanOrEqual(summary.layers)

    expect(summary.byCategory["road-geometry"]).toBe(1)
    expect(summary.byCategory["road-surface"]).toBe(1)
    expect(summary.byCategory["services-fuel"]).toBe(1)
    expect(summary.byCategory["services-food"]).toBe(1)
    expect(summary.byCategory["access-boundary"]).toBe(2)
  })

  it("verifies the full catalog without gaps", () => {
    const result = verifyProvenance()
    expect(result.valid).toBe(true)
    expect(result.missing).toHaveLength(0)
    expect(result.emptyProvenance).toHaveLength(0)
    expect(result.unknownCategory).toHaveLength(0)
  })

  it("detects an empty provenance string when verification runs", () => {
    const badLayer: RiderLayerDefinition = {
      id: "curvature",
      name: "Test",
      category: "roads",
      status: "live",
      source: "Test",
      provenance: "",
      dataCategory: "road-geometry",
      freshness: "Test",
      coverage: "Test",
      legend: "Test",
      minZoom: 0
    }
    const record = provenanceRecord(badLayer)
    expect(record.provenance).toBe("")
  })

  it("all feature-layer ids map to a non-empty provenance", () => {
    for (const layer of layerCatalog) {
      const record = provenanceForLayer(layer.id)
      expect(record).not.toBeNull()
      expect(record!.provenance).toBeTruthy()
      expect(record!.provenance.length).toBeGreaterThan(10)
    }
  })
})
