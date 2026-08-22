import { describe, expect, it } from "vitest"
import { characterForProfile } from "@/lib/domain/routing/ride-character"

describe("characterForProfile", () => {
  it("preserves the ride character for every routing profile", () => {
    const expected: Array<[string, string]> = [
      ["balanced", "balanced"],
      ["quick", "quick"],
      ["twisty", "twisty"],
      ["scenic", "scenic"],
      ["adventure", "adventure"],
      ["gravel", "gravel"],
      ["avoid-highways", "avoid-highways"],
      ["neural", "neural"]
    ]

    for (const [profile, character] of expected) {
      expect(characterForProfile(profile)).toBe(character)
    }
  })

  it("falls back to balanced for an unknown profile", () => {
    expect(characterForProfile("not-a-profile")).toBe("balanced")
  })
})
