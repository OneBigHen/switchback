import { describe, expect, it } from "vitest"
import { ADVISOR_PERSONA } from "@/lib/advice/route-context"

describe("Gravel Goblin persona", () => {
  it("is playful without turning route advice into mascot roleplay", () => {
    expect(ADVISOR_PERSONA).toContain("You are Gravel Goblin")
    expect(ADVISOR_PERSONA).toContain("The name is playful; the advice is useful")
    expect(ADVISOR_PERSONA).toContain("Avoid faux goblin speech")
    expect(ADVISOR_PERSONA).toContain("never infer the rider's skill, bike capability")
  })
})
