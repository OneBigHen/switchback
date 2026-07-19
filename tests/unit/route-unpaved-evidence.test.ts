import { describe, expect, it } from "vitest"
import { calculatePaUnpavedRoadEvidence } from "@/lib/roads/route-unpaved-evidence"
import type {
  GeoJsonPosition,
  PaUnpavedRoadFeatureCollection
} from "@/lib/roads/types"

function collection(
  coordinates: GeoJsonPosition[]
): PaUnpavedRoadFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "pa-unpaved-1",
      geometry: { type: "LineString", coordinates },
      properties: {
        id: "pa-unpaved-1",
        county: "Dauphin",
        lengthMeters: null,
        source: "Pennsylvania Department of Environmental Protection",
        dataset: "Unpaved Roads 2009_07"
      }
    }]
  }
}

describe("official unpaved-road route evidence", () => {
  it("measures a coincident official road by route length", () => {
    const route: GeoJsonPosition[] = [[-76.9, 40.2], [-76.89, 40.2]]

    const evidence = calculatePaUnpavedRoadEvidence(route, collection(route))

    expect(evidence).toMatchObject({
      source: "Pennsylvania Department of Environmental Protection",
      dataset: "Unpaved Roads 2009_07",
      sharePercent: 100,
      matchedFeatureCount: 1,
      matchRadiusMeters: 40,
      minimumContiguousMeters: 80
    })
    expect(evidence.matchedMeters).toBeGreaterThan(800)
    expect(evidence.matchedMeters).toBeLessThan(900)
  })

  it("ignores a short crossing that is not a contiguous official-road run", () => {
    const route: GeoJsonPosition[] = [[-76.91, 40.2], [-76.89, 40.2]]
    const crossing: GeoJsonPosition[] = [[-76.9, 40.19], [-76.9, 40.21]]

    const evidence = calculatePaUnpavedRoadEvidence(route, collection(crossing))

    expect(evidence.matchedMeters).toBe(0)
    expect(evidence.sharePercent).toBe(0)
    expect(evidence.matchedFeatureCount).toBe(0)
  })

  it("retains a short but meaningful aligned official-road connector", () => {
    const connector: GeoJsonPosition[] = [[-76.9, 40.2], [-76.8988, 40.2]]

    const evidence = calculatePaUnpavedRoadEvidence(
      connector,
      collection(connector)
    )

    expect(evidence.matchedMeters).toBeGreaterThan(90)
    expect(evidence.sharePercent).toBe(100)
  })

  it("does not match a parallel road outside the forty-meter radius", () => {
    const route: GeoJsonPosition[] = [[-76.9, 40.2], [-76.89, 40.2]]
    const parallel: GeoJsonPosition[] = [[-76.9, 40.2006], [-76.89, 40.2006]]

    const evidence = calculatePaUnpavedRoadEvidence(route, collection(parallel))

    expect(evidence.sharePercent).toBe(0)
  })

  it("matches every line in an official MultiLineString feature", () => {
    const route: GeoJsonPosition[] = [
      [-76.9, 40.2],
      [-76.895, 40.2],
      [-76.89, 40.2]
    ]
    const roads: PaUnpavedRoadFeatureCollection = {
      type: "FeatureCollection",
      features: [{
        ...collection(route).features[0],
        geometry: {
          type: "MultiLineString",
          coordinates: [route.slice(0, 2), route.slice(1)]
        }
      }]
    }

    const evidence = calculatePaUnpavedRoadEvidence(route, roads)

    expect(evidence.sharePercent).toBe(100)
    expect(evidence.matchedFeatureCount).toBe(1)
  })
})
