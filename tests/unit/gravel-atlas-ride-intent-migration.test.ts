import { describe, expect, it } from "vitest"
import { defaultRideIntent, migrateRideIntent } from "@/lib/domain/ride-intent"
import { getRideIntent } from "@/stores/planner-store"

describe("Gravel Atlas ride-intent compatibility", () => {
  it("upgrades a pre-Atlas ride intent without losing the rider draft", () => {
    const legacy = { ...defaultRideIntent() } as Record<string, unknown>
    delete legacy.gravelAtlas

    expect(migrateRideIntent(legacy)).toMatchObject({
      gravelAtlas: { enabled: false, intensity: "balanced" }
    })
  })

  it("keeps the routing preference in the store's canonical intent projection", () => {
    const intent = {
      ...defaultRideIntent(),
      profile: "adventure" as const,
      gravelAtlas: { enabled: true, intensity: "maximum" as const }
    }

    expect(getRideIntent(intent).gravelAtlas).toEqual({
      enabled: true,
      intensity: "maximum"
    })
  })
})
