import { describe, expect, it } from "vitest"
import { buildRouteStory } from "@/lib/gpx/route-story"

describe("buildRouteStory grounding", () => {
  it("does not infer a loop, sightlines, or uniform road character from distance and twistiness", () => {
    const story = buildRouteStory({
      id: "bald-eagle",
      name: "Bald Eagle Dual Sport",
      distanceMiles: 104.7,
      durationMinutes: 0,
      twistiness: 15,
      turnCount: 0
    })

    expect(story.summary).not.toMatch(/loop|half-day|dead straight|start to finish/i)
    expect(story.body).not.toMatch(/sightlines|easy navigation|relaxed pace/i)
    expect(story.body).not.toContain("0 min")
  })

  it("describes known distance, imported time, mapped turns, and route-level curvature without embellishment", () => {
    const story = buildRouteStory({
      id: "forest-run",
      name: "Forest Run",
      distanceMiles: 62.2,
      durationMinutes: 130,
      twistiness: 70,
      turnCount: 123
    })

    expect(story.body).toContain("62 miles")
    expect(story.body).toContain("2 hr 10 min")
    expect(story.body).toContain("123 mapped turns")
    expect(story.body).toContain("70/100")
    expect(story.body).not.toMatch(/full attention|right hand|safe|surface|paved|gravel/i)
  })
})
