import { describe, expect, it } from "vitest"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import { buildAtlasBrowseRoutes, type AtlasListingRoute } from "@/app/gpx-library/atlas-listing"

function listing(over: Partial<AtlasListingRoute> & { id: string }): AtlasListingRoute {
  return {
    name: "Route",
    distanceMiles: 80,
    durationMinutes: 120,
    twistiness: 50,
    turnCount: 40,
    sourceProject: "rideplanner",
    ...over
  }
}

function art(over: Partial<AtlasRouteArt> = {}): AtlasRouteArt {
  return {
    aspect: 1.1,
    bbox: [-77.9, 40.75, -77.25, 41.1],
    paths: [{ band: "twisty", d: "M0 0 L10 10" }],
    start: [0, 0],
    end: [10, 10],
    ...over
  }
}

describe("buildAtlasBrowseRoutes", () => {
  it("builds truthful card rows: cleaned title, unknown duration as null, real preview path and area filing", () => {
    const [row] = buildAtlasBrowseRoutes(
      [listing({ id: "a", name: "000 Bald Eagle Loop - created by rider on ADVHub.net", durationMinutes: 0 })],
      { a: art() }
    )
    expect(row).toMatchObject({
      id: "a",
      name: "Bald Eagle Loop",
      title: "Bald Eagle Loop",
      durationMinutes: null,
      region: "North-Central PA",
      ridingAreas: ["PA Wilds", "Bald Eagle / Rothrock"],
      paths: ["M0 0 L10 10"]
    })
  })

  it("collapses geometry duplicates and near-duplicate families to one card, preferring the canonical", () => {
    const rows = buildAtlasBrowseRoutes(
      [
        listing({ id: "copy", distanceMiles: 99, duplicateFamilyId: "f", duplicateFamilyRole: "near-duplicate" }),
        listing({ id: "canon", distanceMiles: 80, duplicateFamilyId: "f", duplicateFamilyRole: "canonical" }),
        listing({ id: "reimport" }),
        listing({ id: "solo", name: "Solo" })
      ],
      { copy: art(), canon: art(), reimport: art({ duplicateOf: "solo" }), solo: art() }
    )
    expect(rows.map((row) => row.id)).toEqual(["canon", "solo"])
  })

  it("falls back to the longest family member when no canonical is flagged", () => {
    const rows = buildAtlasBrowseRoutes(
      [
        listing({ id: "short", distanceMiles: 40, duplicateFamilyId: "f" }),
        listing({ id: "long", distanceMiles: 90, duplicateFamilyId: "f" })
      ],
      { short: art(), long: art() }
    )
    expect(rows.map((row) => row.id)).toEqual(["long"])
  })

  it("omits routes with no drawable art and disambiguates repeated titles by distance", () => {
    const rows = buildAtlasBrowseRoutes(
      [
        listing({ id: "x", name: "Connector", distanceMiles: 12.2 }),
        listing({ id: "y", name: "Connector", distanceMiles: 31.6 }),
        listing({ id: "no-art", name: "Invisible" })
      ],
      { x: art(), y: art() }
    )
    expect(rows.map((row) => row.title)).toEqual(["Connector · 12 mi", "Connector · 32 mi"])
  })
})
