import { describe, expect, it } from "vitest"
import { DEFAULT_FILTERS, type AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import {
  applyQuickChips,
  describeDiscoveryResult,
  hasGravelEvidence,
  INITIAL_CAMERA,
  isTwoToFourHours,
  NO_QUICK_CHIPS,
  quickChipAvailability,
  recenterDiscoveryMap,
  reconcileSelection,
  riderMovedDiscoveryMap,
  routeMinutes,
  runDiscoveryQuery,
  selectDiscoveryRoute,
  toggleQuickChip
} from "@/components/route-library/route-discovery-state"

function route(overrides: Partial<AtlasBrowseRoute> = {}): AtlasBrowseRoute {
  return {
    id: "r1",
    name: "Test ride",
    title: "Test ride",
    tone: "Day loop",
    band: "twisty",
    distanceMiles: 100,
    durationMinutes: null,
    turnCount: 120,
    twistiness: 55,
    unpavedShare: null,
    profile: null,
    bbox: [-77.9, 40.75, -77.25, 41.1],
    region: "North-Central PA",
    ridingAreas: ["PA Wilds"],
    aspect: 1.1,
    paths: ["M12 108 L88 18"],
    start: [12, 108],
    end: [88, 18],
    canUseGeometry: true,
    ...overrides
  }
}

describe("routeMinutes", () => {
  it("uses a recorded time as-is", () => {
    expect(routeMinutes(route({ durationMinutes: 95 }))).toEqual({ minutes: 95, estimated: false })
  })

  it("marks a distance-derived time as estimated", () => {
    const result = routeMinutes(route({ durationMinutes: null, distanceMiles: 102 }))

    expect(result.estimated).toBe(true)
    expect(result.minutes).toBeGreaterThan(0)
  })

  it("reports nothing rather than zero when there is no usable evidence", () => {
    expect(routeMinutes(route({ durationMinutes: null, distanceMiles: 0 })))
      .toEqual({ minutes: null, estimated: false })
  })
})

describe("gravel evidence", () => {
  it("accepts a measured unpaved share", () => {
    expect(hasGravelEvidence(route({ unpavedShare: 0.4 }))).toBe(true)
  })

  it("accepts an adventure or gravel routing profile", () => {
    expect(hasGravelEvidence(route({ profile: "adventure" }))).toBe(true)
    expect(hasGravelEvidence(route({ profile: "gravel" }))).toBe(true)
  })

  it("does not invent gravel from a scenic profile with no surface evidence", () => {
    expect(hasGravelEvidence(route({ profile: "scenic" }))).toBe(false)
    expect(hasGravelEvidence(route())).toBe(false)
  })
})

describe("quick chips", () => {
  it("expresses Nearby and Twisty through the shared filter model", () => {
    const applied = applyQuickChips(DEFAULT_FILTERS, { chips: ["nearby", "twisty"] }, true)

    expect(applied.radius).toBe("100")
    expect(applied.sort).toBe("nearest")
    expect(applied.bands).toEqual(expect.arrayContaining(["twisty", "hairpin"]))
  })

  it("does not force a location-based filter without a location", () => {
    expect(applyQuickChips(DEFAULT_FILTERS, { chips: ["nearby"] }, false).radius)
      .toBe(DEFAULT_FILTERS.radius)
  })

  it("keeps bands the rider already picked", () => {
    const applied = applyQuickChips({ ...DEFAULT_FILTERS, bands: ["calm"] }, { chips: ["twisty"] }, false)

    expect(applied.bands).toEqual(expect.arrayContaining(["calm", "twisty", "hairpin"]))
  })

  it("toggles on and off", () => {
    const on = toggleQuickChip(NO_QUICK_CHIPS, "gravel")
    expect(on.chips).toEqual(["gravel"])
    expect(toggleQuickChip(on, "gravel").chips).toEqual([])
  })

  it("offers a chip the catalog cannot satisfy as disabled, with a reason", () => {
    const routes = [route({ profile: "scenic" })]
    const gravel = quickChipAvailability("gravel", routes, true)

    expect(gravel.enabled).toBe(false)
    expect(gravel.reason).toMatch(/surface evidence/i)
    expect(quickChipAvailability("nearby", routes, false).enabled).toBe(false)
    expect(quickChipAvailability("filters", routes, false).enabled).toBe(true)
  })

  it("enables a chip the catalog can satisfy", () => {
    expect(quickChipAvailability("gravel", [route({ profile: "adventure" })], true).enabled).toBe(true)
    expect(quickChipAvailability("twisty", [route({ band: "hairpin" })], true).enabled).toBe(true)
  })
})

describe("runDiscoveryQuery", () => {
  const routes = [
    route({ id: "gravel-big", profile: "adventure", distanceMiles: 160, band: "twisty" }),
    route({ id: "paved-short", profile: "scenic", distanceMiles: 40, band: "calm" }),
    route({ id: "mid", profile: "scenic", distanceMiles: 100, band: "twisty" })
  ]

  it("returns the shared filter result untouched when no chip is active", () => {
    const result = runDiscoveryQuery(routes, DEFAULT_FILTERS, NO_QUICK_CHIPS, null)

    expect(result.ranked).toHaveLength(3)
    expect(result.removedByChips).toBe(0)
  })

  it("narrows to routes with real gravel evidence", () => {
    const result = runDiscoveryQuery(routes, DEFAULT_FILTERS, { chips: ["gravel"] }, null)

    expect(result.ranked.map((entry) => entry.route.id)).toEqual(["gravel-big"])
    expect(result.removedByChips).toBe(2)
  })

  it("keeps map and list on one query by sharing the same ranked result", () => {
    const filters = { ...DEFAULT_FILTERS, query: "test" }
    const forMap = runDiscoveryQuery(routes, filters, { chips: ["twisty"] }, null)
    const forList = runDiscoveryQuery(routes, filters, { chips: ["twisty"] }, null)

    expect(forMap.ranked.map((entry) => entry.route.id)).toEqual(forList.ranked.map((entry) => entry.route.id))
  })

  it("applies the 2-4 hour window over recorded and estimated time alike", () => {
    const timed = [
      route({ id: "recorded", durationMinutes: 150 }),
      route({ id: "too-short", durationMinutes: 45, distanceMiles: 20 }),
      route({ id: "estimated", durationMinutes: null, distanceMiles: 100 })
    ]
    const result = runDiscoveryQuery(timed, DEFAULT_FILTERS, { chips: ["duration-2-4"] }, null)

    expect(result.ranked.map((entry) => entry.route.id).sort()).toEqual(["estimated", "recorded"])
    expect(isTwoToFourHours(timed[1]!)).toBe(false)
  })
})

describe("discovery camera", () => {
  it("earns the camera on an explicit selection", () => {
    const selected = selectDiscoveryRoute(INITIAL_CAMERA, "r1")

    expect(selected.selectedId).toBe("r1")
    expect(selected.fitToken).toBe(1)
    expect(selected.riderMovedMap).toBe(false)
  })

  it("does not re-fit when the same route is selected again", () => {
    const selected = selectDiscoveryRoute(INITIAL_CAMERA, "r1")

    expect(selectDiscoveryRoute(selected, "r1")).toBe(selected)
  })

  it("stops taking the camera once the rider has moved the map", () => {
    const moved = riderMovedDiscoveryMap(selectDiscoveryRoute(INITIAL_CAMERA, "r1"))

    expect(moved.riderMovedMap).toBe(true)
    // Incidental churn must not clear the flag.
    expect(reconcileSelection(moved, [{ route: { id: "r1" } as never, awayMiles: null }]).riderMovedMap).toBe(true)
  })

  it("gives the camera back on an explicit selection after a manual pan", () => {
    const moved = riderMovedDiscoveryMap(selectDiscoveryRoute(INITIAL_CAMERA, "r1"))
    const next = selectDiscoveryRoute(moved, "r2")

    expect(next.riderMovedMap).toBe(false)
    expect(next.fitToken).toBe(moved.fitToken + 1)
  })

  it("gives the camera back on an explicit recenter", () => {
    const moved = riderMovedDiscoveryMap(selectDiscoveryRoute(INITIAL_CAMERA, "r1"))
    const recentred = recenterDiscoveryMap(moved)

    expect(recentred.riderMovedMap).toBe(false)
    expect(recentred.selectedId).toBe("r1")
    expect(recentred.fitToken).toBe(moved.fitToken + 1)
  })

  it("drops a selection that the filters removed", () => {
    const selected = selectDiscoveryRoute(INITIAL_CAMERA, "gone")

    expect(reconcileSelection(selected, []).selectedId).toBeNull()
  })
})

describe("describeDiscoveryResult", () => {
  it("says what narrowed the list", () => {
    expect(describeDiscoveryResult(0, DEFAULT_FILTERS, NO_QUICK_CHIPS, false)).toBe("No routes match")
    expect(describeDiscoveryResult(3, { ...DEFAULT_FILTERS, radius: "100" }, NO_QUICK_CHIPS, true))
      .toBe("3 routes within 100 mi")
    expect(describeDiscoveryResult(1, { ...DEFAULT_FILTERS, query: "bald" }, NO_QUICK_CHIPS, false))
      .toBe("1 route matching “bald”")
    expect(describeDiscoveryResult(2, DEFAULT_FILTERS, { chips: ["gravel"] }, false)).toBe("2 routes match")
  })
})
