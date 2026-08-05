import { describe, expect, it } from "vitest"
import { roadMatchFromGraphHopperPayload } from "@/lib/roads/road-matching"

const payload = {
  paths: [{
    points: { coordinates: [[-76.9, 40.2], [-76.88, 40.21], [-76.86, 40.22]] as [number, number][] },
    details: {
      edge_id: [[0, 1, "edge-1"], [1, 2, "edge-2"]] as [number, number, string][],
      street_name: [[0, 2, "Ridge Rd"]] as [number, number, string][],
      surface: [[0, 2, "asphalt"]] as [number, number, string][],
      toll: [[0, 2, "NO"]] as [number, number, string][]
    }
  }],
  info: { version: "11.0" }
}

describe("road matching payload parsing (SB-013)", () => {
  it("extracts real edge ids, street names, geometry, and access evidence", () => {
    const result = roadMatchFromGraphHopperPayload(payload, [-76.9, 40.2], [-76.86, 40.22])
    expect(result).not.toBeNull()
    expect(result!.edgeIds).toEqual(["edge-1", "edge-2"])
    expect(result!.streetNames).toEqual(["Ridge Rd"])
    expect(result!.displayName).toBe("Ridge Rd")
    expect(result!.geometry.length).toBe(3)
    expect(result!.access).toMatchObject({ motorcycle: "permitted", toll: false, surface: "asphalt" })
    expect(result!.graphVersion).toBe("11.0")
    expect(result!.match).toMatchObject({ status: "exact-edge", confidence: 1 })
  })

  it("returns unresolved when the router gives no edge ids", () => {
    const result = roadMatchFromGraphHopperPayload({
      paths: [{
        points: { coordinates: [[-76.9, 40.2], [-76.86, 40.22]] as [number, number][] },
        details: { surface: [[0, 1, "asphalt"]] as [number, number, string][] }
      }],
      info: { version: "11.0" }
    }, [-76.9, 40.2], [-76.86, 40.22])
    expect(result).not.toBeNull()
    expect(result!.match.status).toBe("unresolved")
    expect(result!.edgeIds).toEqual([])
  })

  it("returns null for an empty router response", () => {
    expect(roadMatchFromGraphHopperPayload({ paths: [] }, [-76.9, 40.2], [-76.86, 40.22])).toBeNull()
    expect(roadMatchFromGraphHopperPayload({ paths: [{ points: { coordinates: [[-76.9, 40.2]] as [number, number][] } }] }, [-76.9, 40.2], [-76.86, 40.22])).toBeNull()
  })

  it("flags a toll road when the detail is not NO", () => {
    const tollPayload = {
      paths: [{
        points: { coordinates: [[-76.9, 40.2], [-76.86, 40.22]] as [number, number][] },
        details: { toll: [[0, 1, "ALL"]] as [number, number, string][] }
      }]
    }
    const result = roadMatchFromGraphHopperPayload(tollPayload, [-76.9, 40.2], [-76.86, 40.22])
    expect(result!.access.toll).toBe(true)
  })
})
