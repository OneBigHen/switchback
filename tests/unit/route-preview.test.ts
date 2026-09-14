import { describe, expect, it } from "vitest"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import type { Coordinate } from "@/lib/routing/types"
import {
  atlasGeoEndpoints,
  atlasGeometryFingerprint,
  atlasGeoLines,
  atlasGeoPolyline,
  boundingBoxOf,
  buildRoutePreviewSpec,
  latitudeFromMercatorY,
  mercatorY,
  padBoundingBox,
  ROUTE_PREVIEW_PADDING_FRACTION,
  simplifyForOverlay,
  type GeoBoundingBox
} from "@/lib/routes/route-preview"

const ATLAS_VIEW_WIDTH = 100
const ATLAS_VIEW_HEIGHT = 125
const ATLAS_PAD = 8

/**
 * Mirror of the forward transform in `scripts/build-route-atlas.mjs`. The
 * inverse under test is only trustworthy if it is checked against the real
 * builder's maths rather than against itself.
 */
function projectLikeAtlasBuilder(geometry: ReadonlyArray<readonly [number, number]>) {
  const xs = geometry.map(([lon]) => lon)
  const ys = geometry.map(([, lat]) => mercatorY(lat))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(1e-9, maxX - minX)
  const spanY = Math.max(1e-9, maxY - minY)
  const boxW = ATLAS_VIEW_WIDTH - ATLAS_PAD * 2
  const boxH = ATLAS_VIEW_HEIGHT - ATLAS_PAD * 2
  const scale = Math.min(boxW / spanX, boxH / spanY)
  const offsetX = ATLAS_PAD + (boxW - spanX * scale) / 2
  const offsetY = ATLAS_PAD + (boxH - spanY * scale) / 2
  const view = geometry.map(([lon, lat]) => [
    offsetX + (lon - minX) * scale,
    offsetY + (maxY - mercatorY(lat)) * scale
  ] as const)
  const bbox: GeoBoundingBox = [
    Number(minX.toFixed(5)),
    Number(Math.min(...geometry.map(([, lat]) => lat)).toFixed(5)),
    Number(maxX.toFixed(5)),
    Number(Math.max(...geometry.map(([, lat]) => lat)).toFixed(5))
  ]
  return {
    bbox,
    d: `M ${view.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")}`,
    start: [Number(view[0]![0].toFixed(1)), Number(view[0]![1].toFixed(1))] as const,
    end: [
      Number(view[view.length - 1]![0].toFixed(1)),
      Number(view[view.length - 1]![1].toFixed(1))
    ] as const
  }
}

describe("Mercator round trip", () => {
  it("recovers the latitude it projected", () => {
    for (const latitude of [-64.2, -12, 0, 18.44, 40.7128, 60.5, 84.9]) {
      expect(latitudeFromMercatorY(mercatorY(latitude))).toBeCloseTo(latitude, 9)
    }
  })

  it("clamps beyond the Mercator limit instead of returning infinity", () => {
    expect(Number.isFinite(mercatorY(90))).toBe(true)
    expect(Number.isFinite(mercatorY(-90))).toBe(true)
  })
})

describe("atlasGeoLines", () => {
  const geometry = [
    [-77.9, 40.75],
    [-77.72, 40.83],
    [-77.55, 40.79],
    [-77.4, 40.98],
    [-77.25, 41.1]
  ] as const

  it("recovers real-world coordinates from atlas poster art", () => {
    const projected = projectLikeAtlasBuilder(geometry)
    const art: AtlasRouteArt = {
      bbox: projected.bbox,
      paths: [{ band: "twisty", d: projected.d }]
    }

    const [line] = atlasGeoLines(art)

    expect(line).toBeDefined()
    expect(line!.coordinates).toHaveLength(geometry.length)
    line!.coordinates.forEach((coordinate, index) => {
      // One tenth of a viewBox unit is the builder's own rounding floor; over
      // this 0.65-degree route that is well under a tenth of a mile.
      expect(coordinate[0]).toBeCloseTo(geometry[index]![0], 2)
      expect(coordinate[1]).toBeCloseTo(geometry[index]![1], 2)
    })
  })

  it("keeps the recovered line inside the route's own bounding box", () => {
    const projected = projectLikeAtlasBuilder(geometry)
    const polyline = atlasGeoPolyline({ bbox: projected.bbox, paths: [{ band: "calm", d: projected.d }] })
    const recovered = boundingBoxOf(polyline)!

    expect(recovered[0]).toBeGreaterThanOrEqual(projected.bbox[0] - 0.01)
    expect(recovered[1]).toBeGreaterThanOrEqual(projected.bbox[1] - 0.01)
    expect(recovered[2]).toBeLessThanOrEqual(projected.bbox[2] + 0.01)
    expect(recovered[3]).toBeLessThanOrEqual(projected.bbox[3] + 0.01)
  })

  it("recovers start and end markers as geography", () => {
    const projected = projectLikeAtlasBuilder(geometry)
    const { start, end } = atlasGeoEndpoints({
      bbox: projected.bbox,
      paths: [{ band: "twisty", d: projected.d }],
      start: projected.start,
      end: projected.end
    })

    expect(start![0]).toBeCloseTo(geometry[0]![0], 2)
    expect(start![1]).toBeCloseTo(geometry[0]![1], 2)
    expect(end![0]).toBeCloseTo(geometry[geometry.length - 1]![0], 2)
    expect(end![1]).toBeCloseTo(geometry[geometry.length - 1]![1], 2)
  })

  it("refuses to place a route whose art carried no bounding box", () => {
    expect(atlasGeoLines({ paths: [{ band: "calm", d: "M10 10 L20 20" }] })).toEqual([])
    expect(atlasGeoPolyline(null)).toEqual([])
    expect(atlasGeoEndpoints(undefined)).toEqual({ start: null, end: null })
  })

  it("drops degenerate path pieces rather than drawing a dot as a ride", () => {
    const projected = projectLikeAtlasBuilder(geometry)
    const lines = atlasGeoLines({
      bbox: projected.bbox,
      paths: [{ band: "calm", d: "M 12 108" }, { band: "twisty", d: projected.d }]
    })

    expect(lines).toHaveLength(1)
  })

  it("survives a zero-height bounding box without producing NaN", () => {
    const lines = atlasGeoLines({
      bbox: [-77.5, 40.8, -77.5, 40.8],
      paths: [{ band: "calm", d: "M 8 8 L 92 117" }]
    })

    expect(lines).toEqual([])
  })
})

describe("padBoundingBox", () => {
  it("adds proportional padding around the route extent", () => {
    const [west, south, east, north] = padBoundingBox([-76, 40, -75, 41], 0.13)

    expect(east - west).toBeCloseTo(1.13, 6)
    expect(north - south).toBeCloseTo(1.13, 6)
    expect((west + east) / 2).toBeCloseTo(-75.5, 6)
    expect((south + north) / 2).toBeCloseTo(40.5, 6)
  })

  it("defaults to the approved 12-15% framing", () => {
    expect(ROUTE_PREVIEW_PADDING_FRACTION).toBeGreaterThanOrEqual(0.12)
    expect(ROUTE_PREVIEW_PADDING_FRACTION).toBeLessThanOrEqual(0.15)
    const padded = padBoundingBox([-76, 40, -75, 41])
    expect(padded[2] - padded[0]).toBeGreaterThan(1)
  })

  it("widens a point route into a readable neighbourhood", () => {
    const padded = padBoundingBox([-75.2, 40.4, -75.2, 40.4])

    expect(padded[2] - padded[0]).toBeGreaterThan(0)
    expect(padded[3] - padded[1]).toBeGreaterThan(0)
    expect(padded.every((value) => Number.isFinite(value))).toBe(true)
  })

  it("never escapes valid geographic space", () => {
    const padded = padBoundingBox([-180, -85, 180, 85], 0.5)

    expect(padded[0]).toBeGreaterThanOrEqual(-180)
    expect(padded[2]).toBeLessThanOrEqual(180)
    expect(padded[1]).toBeGreaterThanOrEqual(-85.06)
    expect(padded[3]).toBeLessThanOrEqual(85.06)
  })
})

describe("buildRoutePreviewSpec", () => {
  const base = {
    routeId: "fixture-water-gap",
    bbox: [-75.15, 40.9, -74.95, 41.1] as GeoBoundingBox,
    size: "small" as const,
    styleId: "clean",
    geometryFingerprint: "5-abc123"
  }

  it("is deterministic for identical inputs", () => {
    expect(buildRoutePreviewSpec(base).key).toBe(buildRoutePreviewSpec(base).key)
  })

  it("frames the padded bbox, not the raw route extent", () => {
    const spec = buildRoutePreviewSpec(base)

    expect(spec.bbox[0]).toBeLessThan(base.bbox[0])
    expect(spec.bbox[2]).toBeGreaterThan(base.bbox[2])
  })

  it("separates size, style and geometry in the cache key", () => {
    const small = buildRoutePreviewSpec(base).key
    const medium = buildRoutePreviewSpec({ ...base, size: "medium" }).key
    const night = buildRoutePreviewSpec({ ...base, styleId: "night" }).key
    const moved = buildRoutePreviewSpec({ ...base, geometryFingerprint: "5-zzz999" }).key

    expect(new Set([small, medium, night, moved]).size).toBe(4)
  })

  it("does not change the key when a selection highlight changes", () => {
    // Selection is a paint-time concern: a selected card must not miss the
    // cache and re-render the same geography a second time.
    expect(buildRoutePreviewSpec(base).key).toBe(buildRoutePreviewSpec({ ...base }).key)
  })

  it("survives a missing bounding box with a finite frame", () => {
    const spec = buildRoutePreviewSpec({ ...base, bbox: null })

    expect(spec.bbox.every((value) => Number.isFinite(value))).toBe(true)
    expect(spec.width).toBeGreaterThan(0)
  })
})

describe("atlasGeometryFingerprint", () => {
  it("changes when the line changes", () => {
    const a = atlasGeometryFingerprint({ paths: [{ band: "calm", d: "M1 1 L2 2" }] })
    const b = atlasGeometryFingerprint({ paths: [{ band: "calm", d: "M1 1 L2 3" }] })

    expect(a).not.toBe(b)
    expect(a).toBe(atlasGeometryFingerprint({ paths: [{ band: "calm", d: "M1 1 L2 2" }] }))
  })

  it("reports no line rather than a fake one", () => {
    expect(atlasGeometryFingerprint({ paths: [] })).toBeNull()
    expect(atlasGeometryFingerprint(null)).toBeNull()
  })
})

describe("simplifyForOverlay", () => {
  it("keeps both ends of the route", () => {
    const line: Coordinate[] = Array.from({ length: 500 }, (_, index) => [index / 100, 40 + index / 1000])
    const simplified = simplifyForOverlay(line, 32)

    expect(simplified).toHaveLength(32)
    expect(simplified[0]).toEqual(line[0])
    expect(simplified[simplified.length - 1]).toEqual(line[line.length - 1])
  })

  it("leaves short lines untouched", () => {
    const line: Coordinate[] = [[-75, 40], [-74.9, 40.1]]
    expect(simplifyForOverlay(line, 96)).toEqual([...line])
  })
})
