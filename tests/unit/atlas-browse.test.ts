import { describe, expect, it } from "vitest"
import {
  haversineMiles,
  centerOfBbox,
  centerOfPath,
  formatAway
} from "@/lib/client/geo"
import {
  browseAtlas,
  classifyRegion,
  lengthBucket,
  distanceFromAnchorMiles,
  DEFAULT_FILTERS,
  type AtlasBrowseRoute
} from "@/app/gpx-library/atlas-browse"

function route(over: Partial<AtlasBrowseRoute>): AtlasBrowseRoute {
  return {
    id: over.id ?? "r",
    name: over.name ?? "Route",
    title: over.title ?? "Route",
    tone: "Day loop",
    band: over.band ?? "mellow",
    distanceMiles: over.distanceMiles ?? 100,
    durationMinutes: 0,
    turnCount: over.turnCount ?? 100,
    twistiness: over.twistiness ?? 40,
    unpavedShare: null,
    bbox: over.bbox ?? null,
    region: over.region ?? null,
    aspect: 1,
    paths: over.paths ?? ["M0 0 L10 10"],
    start: null,
    end: null
  }
}

describe("geo maths", () => {
  it("haversine is ~0 for the same point and grows with separation", () => {
    expect(haversineMiles([-77, 40], [-77, 40])).toBeCloseTo(0, 5)
    const near = haversineMiles([-77, 40], [-77.1, 40])
    const far = haversineMiles([-77, 40], [-80, 40])
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
  })

  it("one degree of latitude is roughly 69 miles", () => {
    expect(haversineMiles([-77, 40], [-77, 41])).toBeGreaterThan(68)
    expect(haversineMiles([-77, 40], [-77, 41])).toBeLessThan(70)
  })

  it("centerOfBbox / centerOfPath return the midpoint", () => {
    expect(centerOfBbox([-80, 39, -78, 41])).toEqual([-79, 40])
    expect(centerOfPath([[-80, 39], [-78, 41]])).toEqual([-79, 40])
    expect(centerOfPath([])).toBeNull()
  })

  it("formatAway keeps units honest at both ends", () => {
    expect(formatAway(0.4)).toBe("Right here")
    expect(formatAway(4)).toBe("4 mi away")
    expect(formatAway(123)).toBe("125 mi away")
  })
})

describe("classifyRegion", () => {
  it("files a centroid into its box, else Farther afield, else null", () => {
    expect(classifyRegion([-80, 40.2, -79, 40.6])).toBe("Western Pennsylvania")
    expect(classifyRegion([-120, 45, -119, 46])).toBe("Farther afield")
    expect(classifyRegion(null)).toBeNull()
  })
})

describe("lengthBucket", () => {
  it("buckets by distance", () => {
    expect(lengthBucket(20)).toBe("short")
    expect(lengthBucket(90)).toBe("day")
    expect(lengthBucket(300)).toBe("big")
  })
})

describe("browseAtlas", () => {
  const anchor = { lat: 40.44, lon: -79.99, at: 0 }
  const near = route({ id: "near", title: "Near loop", distanceMiles: 60, bbox: [-80.1, 40.3, -79.8, 40.6], band: "twisty", twistiness: 80 })
  const far = route({ id: "far", title: "Far haul", distanceMiles: 300, bbox: [-90, 44, -89, 45], band: "calm", twistiness: 10 })

  it("orders by distance for the nearest sort and reports out-of-radius", () => {
    const { ranked } = browseAtlas([far, near], { ...DEFAULT_FILTERS, sort: "nearest" }, anchor)
    expect(ranked.map((r) => r.route.id)).toEqual(["near", "far"])
    expect(ranked[0]!.awayMiles).toBeGreaterThanOrEqual(0)

    const within = browseAtlas([far, near], { ...DEFAULT_FILTERS, sort: "nearest", radius: "100" }, anchor)
    expect(within.ranked.map((r) => r.route.id)).toEqual(["near"])
    expect(within.outsideRadius).toBe(1)
  })

  it("longest / shortest sorts ignore location", () => {
    expect(browseAtlas([near, far], { ...DEFAULT_FILTERS, sort: "longest" }, null).ranked.map((r) => r.route.id)).toEqual(["far", "near"])
    expect(browseAtlas([far, near], { ...DEFAULT_FILTERS, sort: "shortest" }, null).ranked.map((r) => r.route.id)).toEqual(["near", "far"])
  })

  it("applies text, length and corner filters", () => {
    expect(browseAtlas([near, far], { ...DEFAULT_FILTERS, query: "haul" }, null).ranked.map((r) => r.route.id)).toEqual(["far"])
    expect(browseAtlas([near, far], { ...DEFAULT_FILTERS, lengths: ["big"] }, null).ranked.map((r) => r.route.id)).toEqual(["far"])
    expect(browseAtlas([near, far], { ...DEFAULT_FILTERS, bands: ["twisty"] }, null).ranked.map((r) => r.route.id)).toEqual(["near"])
  })

  it("distanceFromAnchorMiles measures to the bbox centre", () => {
    expect(distanceFromAnchorMiles(anchor, [-79.99, 40.44, -79.99, 40.44])).toBeCloseTo(0, 3)
  })
})
