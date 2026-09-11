import { describe, expect, it, vi } from "vitest"
import {
  collectOfficialSourceSnapshot,
  type ArcGisPageFetcher
} from "@/lib/roads/gravel-atlas/source-snapshot"

function paFeature(id: number, name = `Road ${id}`) {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "LineString",
      coordinates: [
        [-75.3 + id * 0.001, 40.2],
        [-75.2 + id * 0.001, 40.25]
      ]
    },
    properties: {
      OBJECTID: id,
      NAME: name,
      COUNTY: "BUCKS",
      INSPECTED: "YES",
      LENGTH: 1
    }
  }
}

function njFeature(id: number) {
  return {
    type: "Feature",
    id,
    geometry: {
      type: "LineString",
      coordinates: [
        [-74.8 + id * 0.001, 40.1],
        [-74.7 + id * 0.001, 40.15]
      ]
    },
    properties: {
      OBJECTID: id,
      RCL_NGUID: `nj-${id}`,
      PRIMENAME: `NJ Road ${id}`,
      SURFACETYP: "U",
      STATUSTYP: "A",
      ACCESSSTYP: "N"
    }
  }
}

describe("collectOfficialSourceSnapshot", () => {
  it("requires explicit acknowledgement before fetching the redistribution-restricted PASDA source", async () => {
    const fetchPage = vi.fn<ArcGisPageFetcher>()

    await expect(collectOfficialSourceSnapshot("pa-pasda-2012", {
      fetchPage,
      pageSize: 2,
      maxPages: 2
    })).rejects.toThrow(/permission|restricted|acknowledge/i)

    expect(fetchPage).not.toHaveBeenCalled()
  })

  it("pages through PASDA deterministically and records accepted/rejected source statistics", async () => {
    const urls: string[] = []
    const responses = [
      {
        type: "FeatureCollection",
        features: [paFeature(1), paFeature(2)]
      },
      {
        type: "FeatureCollection",
        features: [
          paFeature(3),
          { type: "Feature", id: 4, geometry: { type: "Point", coordinates: [-75, 40] }, properties: { OBJECTID: 4 } }
        ]
      },
      { type: "FeatureCollection", features: [] }
    ]
    const fetchPage: ArcGisPageFetcher = async (url) => {
      urls.push(url)
      return responses.shift()
    }

    const snapshot = await collectOfficialSourceSnapshot("pa-pasda-2012", {
      fetchPage,
      pageSize: 2,
      maxPages: 5,
      acceptRestrictedSource: true
    })

    expect(snapshot.observations.map((row) => row.sourceFeatureId)).toEqual(["1", "2", "3"])
    expect(snapshot.stats).toEqual({
      pages: 3,
      fetchedFeatures: 4,
      acceptedFeatures: 3,
      rejectedFeatures: 1,
      duplicateFeatures: 0
    })
    expect(urls.map((url) => new URL(url).searchParams.get("resultOffset"))).toEqual(["0", "2", "4"])
    expect(snapshot.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it("uses PASDA's advertised 1000-row service cap when the caller asks for a larger page", async () => {
    const urls: string[] = []
    let requestIndex = 0
    const snapshot = await collectOfficialSourceSnapshot("pa-pasda-2012", {
      fetchPage: async (url) => {
        urls.push(url)
        requestIndex += 1
        return requestIndex === 1
          ? {
              type: "FeatureCollection",
              features: Array.from({ length: 1_000 }, (_, index) => paFeature(index + 1))
            }
          : { type: "FeatureCollection", features: [] }
      },
      pageSize: 2_000,
      maxPages: 3,
      acceptRestrictedSource: true
    })

    expect(snapshot.observations).toHaveLength(1_000)
    expect(urls).toHaveLength(2)
    expect(urls.map((url) => new URL(url).searchParams.get("resultRecordCount"))).toEqual(["1000", "1000"])
    expect(urls.map((url) => new URL(url).searchParams.get("resultOffset"))).toEqual(["0", "1000"])
  })

  it("does not require the PASDA acknowledgement for the attribution-only NJGIN source", async () => {
    const snapshot = await collectOfficialSourceSnapshot("njgin-ng911", {
      fetchPage: async () => ({ type: "FeatureCollection", features: [njFeature(1)] }),
      pageSize: 2,
      maxPages: 2
    })

    expect(snapshot.observations).toHaveLength(1)
    expect(snapshot.observations[0]?.sourceId).toBe("njgin-ng911")
  })

  it("deduplicates byte-equivalent repeated source ids without inflating the snapshot", async () => {
    const repeated = paFeature(1)
    const responses = [
      { type: "FeatureCollection", features: [repeated, paFeature(2)] },
      { type: "FeatureCollection", features: [structuredClone(repeated)] }
    ]

    const snapshot = await collectOfficialSourceSnapshot("pa-pasda-2012", {
      fetchPage: async () => responses.shift(),
      pageSize: 2,
      maxPages: 3,
      acceptRestrictedSource: true
    })

    expect(snapshot.observations.map((row) => row.sourceFeatureId)).toEqual(["1", "2"])
    expect(snapshot.stats.duplicateFeatures).toBe(1)
  })

  it("fails on conflicting duplicate source ids instead of silently choosing one geometry", async () => {
    const changed = paFeature(1, "Changed road")
    changed.geometry.coordinates[1] = [-74.5, 40.6]
    const responses = [
      { type: "FeatureCollection", features: [paFeature(1), paFeature(2)] },
      { type: "FeatureCollection", features: [changed] }
    ]

    await expect(collectOfficialSourceSnapshot("pa-pasda-2012", {
      fetchPage: async () => responses.shift(),
      pageSize: 2,
      maxPages: 3,
      acceptRestrictedSource: true
    })).rejects.toThrow(/duplicate|changed|conflict/i)
  })

  it("caps pagination so a broken service cannot create an infinite statewide fetch", async () => {
    await expect(collectOfficialSourceSnapshot("njgin-ng911", {
      fetchPage: async () => ({ type: "FeatureCollection", features: [njFeature(1), njFeature(2)] }),
      pageSize: 2,
      maxPages: 2
    })).rejects.toThrow(/page|limit|pagination/i)
  })

  it("rejects malformed ArcGIS payloads rather than turning service errors into an empty authoritative snapshot", async () => {
    await expect(collectOfficialSourceSnapshot("njgin-ng911", {
      fetchPage: async () => ({ error: { message: "service unavailable" } }),
      pageSize: 100,
      maxPages: 2
    })).rejects.toThrow(/arcgis|featurecollection|payload|service/i)
  })

  it("produces the same fingerprint for equivalent accepted observations regardless of page ordering", async () => {
    const first = await collectOfficialSourceSnapshot("njgin-ng911", {
      fetchPage: async () => ({ type: "FeatureCollection", features: [njFeature(2), njFeature(1)] }),
      pageSize: 10,
      maxPages: 2
    })
    const second = await collectOfficialSourceSnapshot("njgin-ng911", {
      fetchPage: async () => ({ type: "FeatureCollection", features: [njFeature(1), njFeature(2)] }),
      pageSize: 10,
      maxPages: 2
    })

    expect(first.fingerprint).toBe(second.fingerprint)
  })
})
