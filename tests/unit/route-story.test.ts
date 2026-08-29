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

  it("writes a deterministic editorial title and summary from route stats", () => {
    const first = buildRouteStory(base)
    const second = buildRouteStory(base)
    expect(first).toEqual(second)
    expect(first.title).toBe("Laurel Highlands Loop")
    expect(first.summary).toContain("relentlessly twisty")
    expect(first.tone).toBe("Half-day run")
  })

  it("mentions turn count and rewards-attention copy for twisty routes", () => {
    const story = buildRouteStory(base)
    expect(story.body).toContain("212")
    expect(story.body).toMatch(/corner-after-corner/i)
  })

  it("describes straight routes as covering-ground rides", () => {
    const story = buildRouteStory({ ...base, name: "", twistiness: 8, turnCount: 12 })
    expect(story.title).toBe("The 107-mile half-day run")
    expect(story.body).toMatch(/covering-ground country/i)
  })

  it("bands distance tones from short hop through expedition", () => {
    expect(buildRouteStory({ ...base, distanceMiles: 4 }).tone).toBe("Short hop")
    expect(buildRouteStory({ ...base, distanceMiles: 20 }).tone).toBe("Quick blast")
    expect(buildRouteStory({ ...base, distanceMiles: 60 }).tone).toBe("Day loop")
    expect(buildRouteStory({ ...base, distanceMiles: 500 }).tone).toBe("Expedition")
  })

  it("includes climbing when ascent data exists", () => {
    const story = buildRouteStory({ ...base, ascentMeters: 1800 })
    expect(story.body).toContain("1,800 m")
  })
})
