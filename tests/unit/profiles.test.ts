import { describe, expect, it } from "vitest"
import { getProfile, listProfiles } from "@/lib/routing/profiles"

describe("motorcycle profiles", () => {
  it("maps the four product presets to pinned GraphHopper profiles", () => {
    expect(getProfile("quick").engineProfile).toBe("motorcycle_fastest")
    expect(getProfile("twisty").engineProfile).toBe("motorcycle_twisty")
    expect(getProfile("scenic").engineProfile).toBe("motorcycle_scenic")
    expect(getProfile("adventure").engineProfile).toBe("motorcycle_adventure")
  })

  it("exposes one primary tradeoff for every preset", () => {
    expect(listProfiles()).toHaveLength(4)
    expect(listProfiles().every((profile) => profile.description.length > 10)).toBe(true)
  })

  it("rejects an unknown profile instead of silently routing as a car", () => {
    expect(() => getProfile("car" as never)).toThrow(/unknown motorcycle profile/i)
  })
})
