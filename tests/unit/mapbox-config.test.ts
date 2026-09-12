import { describe, expect, it } from "vitest"
import {
  mapboxRendererStatus,
  mapboxSlotFor
} from "@/lib/client/mapbox-config"

describe("premium Mapbox rollout gate", () => {
  it("stays off until the deployment opts in", () => {
    expect(mapboxRendererStatus({ rollout: false, token: "pk.test" }))
      .toEqual({ enabled: false, reason: "rollout-disabled" })
  })

  it("refuses to enable without a browser-authorized token", () => {
    expect(mapboxRendererStatus({ rollout: true, token: "" }))
      .toEqual({ enabled: false, reason: "missing-token" })
    expect(mapboxRendererStatus({ rollout: true, token: "   " }))
      .toEqual({ enabled: false, reason: "missing-token" })
  })

  it("enables only when both the flag and the token are present", () => {
    expect(mapboxRendererStatus({ rollout: true, token: " pk.test " }))
      .toEqual({ enabled: true, token: "pk.test" })
  })
})

describe("Standard slot contract", () => {
  it("maps every OpenGravel slot to a real Mapbox slot except the critical one", () => {
    expect(mapboxSlotFor("bottom")).toBe("bottom")
    expect(mapboxSlotFor("middle")).toBe("middle")
    expect(mapboxSlotFor("top")).toBe("top")
    // Mapbox has no slot above labels; `critical` is an unslotted layer.
    expect(mapboxSlotFor("critical")).toBeNull()
  })
})
