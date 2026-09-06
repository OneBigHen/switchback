import { describe, expect, it } from "vitest"
import {
  parseRideLibraryQuery,
  searchRideLibrary,
  type RideLibrarySearchDocument
} from "@/lib/rides/ride-library-search"

const routes: RideLibrarySearchDocument[] = [
  {
    id: "lehigh",
    kind: "recorded-ride",
    name: "Lehigh Gorge Backroads",
    sourceLabel: "Recorded ride",
    distanceMiles: 43.8,
    tags: ["gravel", "weekend"],
    roadNames: ["River Road", "Rockport Road"],
    region: {
      primary: "ne",
      regions: ["ne"],
      shares: { ne: 1 },
      outsideShare: 0,
      crossRegion: false,
      label: "NE PA"
    }
  },
  {
    id: "bucks",
    kind: "saved-route",
    name: "Bucks County Loop",
    sourceLabel: "Saved route",
    distanceMiles: 71.2,
    tags: ["paved"],
    roadNames: ["River Road"],
    region: {
      primary: "se",
      regions: ["se"],
      shares: { se: 1 },
      outsideShare: 0,
      crossRegion: false,
      label: "SE PA"
    }
  }
]

describe("Gravel Goblin saved-route search", () => {
  it("turns common natural-language constraints into structured local filters", () => {
    expect(parseRideLibraryQuery("Find my NE gravel rides between 30 and 50 miles on River Road")).toEqual({
      region: "ne",
      minMiles: 30,
      maxMiles: 50,
      kind: undefined,
      terms: ["gravel", "river", "road"]
    })
  })

  it("returns only actual saved route ids that satisfy the interpreted constraints", () => {
    const results = searchRideLibrary(routes, "NE gravel between 30 and 50 miles River Road")
    expect(results.map((result) => result.id)).toEqual(["lehigh"])
  })

  it("supports source intent without inventing a result when nothing matches", () => {
    expect(searchRideLibrary(routes, "recorded NE 40 to 50 miles Rockport").map((result) => result.id)).toEqual(["lehigh"])
    expect(searchRideLibrary(routes, "recorded NW 40 to 50 miles dragon teeth")).toEqual([])
  })
})
