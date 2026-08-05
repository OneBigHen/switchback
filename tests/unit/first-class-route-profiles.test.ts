import { describe, expect, it } from "vitest"
import { createGraphHopperRequest } from "@/lib/routing/graphhopper"
import { createValhallaRequest } from "@/lib/routing/valhalla"
import { getProfile, listProfiles } from "@/lib/routing/profiles"
import type { RouteRequest } from "@/lib/routing/types"

const points = [
  { lat: 40.1, lon: -77.1, label: "Start" },
  { lat: 40.2, lon: -77.0, label: "Finish" }
]

describe("first-class motorcycle route profiles", () => {
  it("exposes every product profile with an explicit engine compatibility mapping", () => {
    expect(listProfiles().map((profile) => profile.id)).toEqual([
      "quick",
      "balanced",
      "twisty",
      "scenic",
      "adventure",
      "gravel",
      "avoid-highways",
      "neural"
    ])
    expect(getProfile("balanced").engineProfile).toBe("motorcycle_fastest")
    expect(getProfile("gravel").engineProfile).toBe("motorcycle_adventure")
    expect(getProfile("neural").engineProfile).toBe("motorcycle_twisty")
  })

  it("turns Avoid Highways into an engine-level hard exclusion", () => {
    const request = {
      profile: "avoid-highways",
      points
    } satisfies RouteRequest
    const graphhopper = createGraphHopperRequest(request)
    const model = graphhopper.custom_model as { priority?: Array<{ if?: string; multiply_by?: string }> }
    expect(model.priority).toEqual(expect.arrayContaining([
      expect.objectContaining({ if: "road_class == MOTORWAY || road_class == TRUNK", multiply_by: "0" })
    ]))

    const valhalla = createValhallaRequest(request)
    expect(valhalla).toMatchObject({
      costing_options: { motorcycle: expect.objectContaining({ use_highways: 0 }) }
    })
  })
})
