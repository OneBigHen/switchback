import { describe, expect, it } from "vitest"
import {
  GRAVEL_ATLAS_SOURCE_POLICIES,
  buildArcGisGeoJsonPageUrl,
  normalizeNjginUnimprovedFeature,
  normalizePaPasda2012Feature
} from "@/lib/roads/gravel-atlas/sources"

const line = {
  type: "LineString" as const,
  coordinates: [
    [-75.2, 40.2],
    [-75.1, 40.25]
  ]
}

describe("official gravel atlas source adapters", () => {
  it("preserves PASDA 2012 as strong surface evidence without inventing access truth", () => {
    const observation = normalizePaPasda2012Feature({
      type: "Feature",
      id: 42,
      geometry: line,
      properties: {
        OBJECTID: 42,
        NAME: "Old Mill Road",
        COUNTY: "BUCKS",
        LENGTH: 1.25,
        INSPECTED: "YES"
      }
    })

    expect(observation).toMatchObject({
      sourceId: "pa-pasda-2012",
      sourceFeatureId: "42",
      region: "PA",
      roadName: "Old Mill Road",
      county: "BUCKS",
      surfaceEvidence: "unpaved",
      accessEvidence: "unknown",
      statusEvidence: "unknown",
      inspected: true
    })
    expect(observation?.geometry).toEqual(line.coordinates)
  })

  it("rejects malformed PASDA geometry rather than manufacturing a road", () => {
    expect(normalizePaPasda2012Feature({
      type: "Feature",
      id: 7,
      geometry: { type: "Point", coordinates: [-75.1, 40.2] },
      properties: { OBJECTID: 7 }
    })).toBeNull()
  })

  it("admits only active non-restricted NJGIN unimproved roads", () => {
    const accepted = normalizeNjginUnimprovedFeature({
      type: "Feature",
      id: 9,
      geometry: line,
      properties: {
        OBJECTID: 9,
        RCL_NGUID: "nj-guid-9",
        PRIMENAME: "Pine Barrens Road",
        SURFACETYP: "U",
        STATUSTYP: "A",
        ACCESSSTYP: "N",
        JURISDICTN: "M",
        DATEUPDATE: 1784764800000
      }
    })

    expect(accepted).toMatchObject({
      sourceId: "njgin-ng911",
      sourceFeatureId: "nj-guid-9",
      region: "NJ",
      roadName: "Pine Barrens Road",
      surfaceEvidence: "unimproved",
      accessEvidence: "non-restricted",
      statusEvidence: "active",
      jurisdiction: "M"
    })

    for (const properties of [
      { SURFACETYP: "I", STATUSTYP: "A", ACCESSSTYP: "N" },
      { SURFACETYP: "U", STATUSTYP: "P", ACCESSSTYP: "N" },
      { SURFACETYP: "U", STATUSTYP: "A", ACCESSSTYP: "R" },
      { SURFACETYP: "U", STATUSTYP: "A", ACCESSSTYP: "UNK" }
    ]) {
      expect(normalizeNjginUnimprovedFeature({
        type: "Feature",
        id: 10,
        geometry: line,
        properties: { OBJECTID: 10, ...properties }
      })).toBeNull()
    }
  })

  it("builds bounded paginated GeoJSON queries rather than downloading a state into one response", () => {
    const pa = new URL(buildArcGisGeoJsonPageUrl("pa-pasda-2012", 2000, 1000))
    expect(pa.searchParams.get("f")).toBe("geojson")
    expect(pa.searchParams.get("where")).toBe("1=1")
    expect(pa.searchParams.get("resultOffset")).toBe("2000")
    expect(pa.searchParams.get("resultRecordCount")).toBe("1000")
    expect(pa.searchParams.get("outSR")).toBe("4326")

    const nj = new URL(buildArcGisGeoJsonPageUrl("njgin-ng911", 0, 1500))
    expect(nj.searchParams.get("where")).toBe("SURFACETYP = 'U' AND STATUSTYP = 'A' AND ACCESSSTYP = 'N'")
    expect(nj.searchParams.get("resultRecordCount")).toBe("1500")
    expect(nj.searchParams.get("outFields")).toContain("RCL_NGUID")
  })

  it("records source-specific coverage and redistribution constraints instead of hiding them", () => {
    expect(GRAVEL_ATLAS_SOURCE_POLICIES["pa-pasda-2012"]).toMatchObject({
      region: "PA",
      updateCadence: "as-needed",
      accessAuthority: "none",
      redistribution: "permission-required"
    })
    expect(GRAVEL_ATLAS_SOURCE_POLICIES["pa-pasda-2012"].coverageCaveats.join(" ").toLowerCase()).toContain("forest")

    expect(GRAVEL_ATLAS_SOURCE_POLICIES["njgin-ng911"]).toMatchObject({
      region: "NJ",
      updateCadence: "monthly",
      accessAuthority: "explicit",
      redistribution: "attribution-requested"
    })
  })
})
