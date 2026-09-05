import { describe, expect, it } from "vitest"
import { briefingText } from "@/lib/advice/route-context"
import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import type { AdvisorRouteContext } from "@/lib/advice/contracts"
import type { CurvatureSegment } from "@/lib/curvature/repository"

const context: AdvisorRouteContext = {
  selectedRouteId: "gravel-loop",
  candidates: [{
    id: "gravel-loop",
    name: "Gravel loop",
    profile: "gravel",
    distanceMiles: 48,
    durationMinutes: 120,
    twistiness: 72,
    turnCount: 66,
    roadMix: { secondary: 60, unclassified: 40 },
    surfaceMix: { gravel: 40, asphalt: 60 },
    officialUnpavedSharePercent: 31.4
  }],
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  warnings: []
}

const officialFeatureCollection = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    id: "pa-unpaved-38",
    geometry: {
      type: "LineString" as const,
      coordinates: [[-76.83, 40.21], [-76.81, 40.23]]
    },
    properties: {
      id: "pa-unpaved-38",
      county: "Dauphin",
      lengthMeters: 965.6,
      source: "Pennsylvania Department of Environmental Protection" as const,
      dataset: "Unpaved Roads 2009_07" as const
    }
  }],
  metadata: {
    count: 1,
    limit: 500,
    truncated: false,
    source: "Pennsylvania Department of Environmental Protection" as const,
    dataset: "Unpaved Roads 2009_07" as const
  }
}

describe("Astra Wave 0 evidence truth", () => {
  it("keeps legal access and current passability unknown even when PA surface evidence exists", () => {
    const briefing = briefingText(context)

    expect(briefing).toContain("31.4%")
    expect(briefing).toContain("Unpaved Roads 2009_07")
    expect(briefing.toLowerCase()).toContain("legal access")
    expect(briefing.toLowerCase()).toContain("current passability")
  })

  it("attributes PA DEP survey road evidence to the survey rather than OpenStreetMap", async () => {
    const toolbox = createAdvisorToolbox({
      queryOfficialUnpaved: async () => officialFeatureCollection
    })

    const result = await toolbox.call("find_good_roads", { surface: "unpaved" }, {
      context,
      conversation: []
    })

    expect(result.places).toHaveLength(1)
    const citation = result.places[0]?.citations[0]
    expect(citation?.title).toContain("Pennsylvania")
    expect(citation?.title).toContain("Unpaved Roads 2009_07")
    expect(citation?.url).not.toContain("openstreetmap.org")
  })

  it("retains known curve-mapped gravel evidence when the official survey returns no nearby features", async () => {
    const gravel: CurvatureSegment[] = [{
      id: "curve-gravel-1",
      name: "Pine Grove Road",
      score: 900,
      surface: "gravel",
      geometry: [[-76.82, 40.22], [-76.81, 40.23]]
    }]
    const toolbox = createAdvisorToolbox({
      queryRoads: () => gravel,
      queryOfficialUnpaved: async () => ({
        type: "FeatureCollection",
        features: [],
        metadata: {
          count: 0,
          limit: 500,
          truncated: false,
          source: "Pennsylvania Department of Environmental Protection",
          dataset: "Unpaved Roads 2009_07"
        }
      })
    })

    const result = await toolbox.call("find_good_roads", { surface: "unpaved" }, {
      context,
      conversation: []
    })
    const note = JSON.stringify(result.content)

    expect(result.places.map((place) => place.name)).toContain("Pine Grove Road")
    expect(note).toContain("curve-scored")
    expect(note).toContain("mapped as unpaved")
    expect(note).not.toContain("curve dataset carries no surface tags")
    expect(note).not.toContain("surface is unknown rather than paved")
  })
})
