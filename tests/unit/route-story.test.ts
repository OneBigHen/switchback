import { describe, expect, it } from "vitest"
import { buildRouteStory } from "@/lib/gpx/route-story"

describe("buildRouteStory", () => {
  const base = {
    id: "project-gpx-test",
    name: "laurel highlands loop.gpx",
    distanceMiles: 107,
    durationMinutes: 210,
    twistiness: 84,
    turnCount: 212
  }

  it("is deterministic and preserves a cleaned real route name", () => {
    const first = buildRouteStory(base)
    const second = buildRouteStory(base)
    expect(first).toEqual(second)
    expect(first.title).toBe("Laurel Highlands Loop")
    expect(first.summary).toContain("substantial route")
    expect(first.summary).toContain("very twisty")
    expect(first.tone).toBe("Big ride")
  })

  it("uses the shared catalog name cleanup for bulk-import noise", () => {
    const story = buildRouteStory({ ...base, name: "000 Armstrong County Loops - created by 54warrior on ADVHub.net" })
    expect(story.title).toBe("Armstrong County Loops")
  })

  it("reports only known distance, duration, turn, and curvature facts", () => {
    const story = buildRouteStory(base)
    expect(story.body).toContain("107 miles")
    expect(story.body).toContain("3 hr 30 min")
    expect(story.body).toContain("212 mapped turns")
    expect(story.body).toContain("84/100")
    expect(story.body).not.toMatch(/corner-after-corner|full attention|right hand|sightline|surface|gravel|paved/i)
  })

  it("uses a factual distance title when the imported track has no usable name", () => {
    const story = buildRouteStory({ ...base, name: "", twistiness: 8, turnCount: 12 })
    expect(story.title).toBe("107-mile imported route")
    expect(story.summary).toContain("low-curvature")
    expect(story.summary).not.toMatch(/loop|half-day|country/i)
  })

  it("bands distance labels without pretending distance determines ride time", () => {
    expect(buildRouteStory({ ...base, distanceMiles: 4 }).tone).toBe("Short hop")
    expect(buildRouteStory({ ...base, distanceMiles: 20 }).tone).toBe("Short ride")
    expect(buildRouteStory({ ...base, distanceMiles: 60 }).tone).toBe("Mid-distance")
    expect(buildRouteStory({ ...base, distanceMiles: 107 }).tone).toBe("Big ride")
    expect(buildRouteStory({ ...base, distanceMiles: 250 }).tone).toBe("Long distance")
    expect(buildRouteStory({ ...base, distanceMiles: 500 }).tone).toBe("Expedition distance")
  })

  it("includes climbing only when ascent data exists", () => {
    const withClimbing = buildRouteStory({ ...base, ascentMeters: 1800 })
    const withoutClimbing = buildRouteStory(base)
    expect(withClimbing.body).toContain("1,800 m")
    expect(withoutClimbing.body).not.toMatch(/climb/i)
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, null])(
    "never turns an unknown duration (%s) into a time claim",
    (durationMinutes) => {
      const story = buildRouteStory({ ...base, durationMinutes })
      expect(story.body).not.toMatch(/\bmin\b|\bhr\b|about 0|unknown/i)
      expect(story.summary).not.toMatch(/\bmin\b|\bhr\b|hour/i)
    }
  )
})

describe("buildRouteStory grounding", () => {
  it("does not infer a loop, sightlines, or uniform road character from distance and twistiness", () => {
    const story = buildRouteStory({
      id: "bald-eagle",
      name: "Bald Eagle Dual Sport",
      distanceMiles: 104.7,
      durationMinutes: null,
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
