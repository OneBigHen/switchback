import { describe, expect, it } from "vitest"
import { boundsToReferenceCorners, normalizeReferenceMap } from "@/lib/client/reference-map"

describe("reference map alignment", () => {
  it("projects a supplied map image onto the current geographic viewport in maplibre corner order", () => {
    expect(boundsToReferenceCorners({ west: -77, south: 40, east: -76, north: 41 })).toEqual([
      [-77, 41], [-76, 41], [-76, 40], [-77, 40]
    ])
  })

  it("clamps reference opacity and rejects non-image or excessive files before map rendering", () => {
    expect(normalizeReferenceMap({
      id: "scan", name: "Paper map", url: "data:image/png;base64,abc", coordinates: boundsToReferenceCorners({ west: -77, south: 40, east: -76, north: 41 }), opacity: 2
    })).toMatchObject({ opacity: 1, name: "Paper map" })
    expect(() => normalizeReferenceMap({
      id: "scan", name: "Bad", url: "https://example.com/map.png", coordinates: [], opacity: 0.5
    })).toThrow(/reference map/i)
  })
})
